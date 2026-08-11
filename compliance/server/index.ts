import "dotenv/config";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, migrateDatabase, rows, audit } from "./db.js";
import { config, demoDataMode } from "./config.js";
import {
  authenticate,
  allow,
  canAdmin,
  canWrite,
  tokenFor,
  type AuthedRequest,
} from "./auth.js";
import { storage } from "./storage.js";
import {
  callPointSchema,
  documentLinkSchema,
  documentTypeSchema,
  extinguisherCheckSchema,
  patSchema,
  photoMetadataSchema,
  resourceSchemas,
  venueSettingsSchema,
} from "./validation.js";

try {
  await migrateDatabase();
  console.log(`Compliance database migrations complete (${db.provider}).`);
} catch (error) {
  console.error("Compliance database migration failed during startup.", error);
  throw error;
}
const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const dummyPasswordHash = bcrypt.hashSync("invalid-login-placeholder", 12);
function rateLimit(prefix: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now(),
      key = `${prefix}:${req.ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now)
      bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader(
      "RateLimit-Remaining",
      String(Math.max(0, max - bucket.count)),
    );
    if (bucket.count > max)
      return res
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
    next();
  };
}

app.get("/health", async (_req, res) => {
  try {
    await db.get("SELECT 1 ready");
    res.json({
      ok: true,
      service: "vl-compliance",
      database: db.provider,
      storage: storage.provider,
    });
  } catch {
    res.status(503).json({ ok: false, service: "vl-compliance" });
  }
});
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "vl-compliance" }),
);
app.use(
  "/api",
  rateLimit("api", Number(process.env.API_RATE_LIMIT || 600), 15 * 60_000),
);
app.post(
  "/api/auth/login",
  rateLimit("login", Number(process.env.LOGIN_RATE_LIMIT || 10), 15 * 60_000),
  async (req, res) => {
    const parsed = z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(8).max(200),
      })
      .strict()
      .safeParse(req.body);
    const email = parsed.success
      ? parsed.data.email.trim().toLowerCase()
      : "invalid";
    const user = parsed.success
      ? await db.get<
          Record<string, unknown> & { passwordHash: string; active: number }
        >(
          "SELECT id,email,name,role,venue_id venueId,password_hash passwordHash,active FROM users WHERE lower(email)=?",
          [email],
        )
      : undefined;
    const passwordMatches =
      parsed.success &&
      bcrypt.compareSync(
        parsed.data.password,
        user?.passwordHash ?? dummyPasswordHash,
      );
    if (!user?.active || !passwordMatches) {
      const emailHash = createHash("sha256")
        .update(email)
        .digest("hex")
        .slice(0, 16);
      await audit(
        "session",
        null,
        "login_failed",
        null,
        { emailHash },
        undefined,
        req.ip,
      );
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const safe = {
      id: Number(user.id),
      email: String(user.email),
      name: String(user.name),
      role: user.role as any,
      venueId: user.venueId == null ? null : Number(user.venueId),
    };
    await audit(
      "session",
      null,
      "login",
      null,
      { userId: safe.id },
      safe.id,
      req.ip,
    );
    res.json({ token: tokenFor(safe), user: safe });
  },
);

app.use("/api", authenticate);
app.get("/api/me", (req: AuthedRequest, res) => res.json(req.user));

const isAdmin = (req: AuthedRequest) => req.user!.role === "administrator";
function venueAllowed(req: AuthedRequest, venueId: number) {
  return isAdmin(req) || req.user!.venueId === venueId;
}
async function assertVenue(req: AuthedRequest, res: Response, venueId: number) {
  if (!venueAllowed(req, venueId)) {
    res.status(403).json({ error: "Venue access denied" });
    return false;
  }
  if (!(await db.get("SELECT id FROM venues WHERE id=?", [venueId]))) {
    res.status(400).json({ error: "Invalid venue" });
    return false;
  }
  return true;
}
async function assertLocation(
  res: Response,
  venueId: number,
  locationId?: number | null,
) {
  if (locationId == null) return true;
  const found = await db.get(
    "SELECT id FROM locations WHERE id=? AND venue_id=? AND active=1",
    [locationId, venueId],
  );
  if (!found) {
    res
      .status(400)
      .json({ error: "Location does not belong to the authorised venue" });
    return false;
  }
  return true;
}
const entityTables: Record<string, { table: string; via?: string }> = {
  asset: { table: "assets" },
  extinguisher: { table: "extinguishers" },
  furnishing: { table: "furnishings" },
  risk_assessment: { table: "risk_assessments" },
  fire_alarm_test: { table: "fire_alarm_tests" },
  fire_alarm_call_point: { table: "fire_alarm_call_points" },
  pat_test: { table: "pat_tests", via: "assets" },
  extinguisher_check: { table: "extinguisher_checks", via: "extinguishers" },
};
async function entityVenue(
  type: string,
  id: number,
): Promise<number | undefined> {
  const cfg = entityTables[type];
  if (!cfg) return undefined;
  if (!cfg.via)
    return (
      await db.get<{ venueId: number }>(
        `SELECT venue_id venueId FROM ${cfg.table} WHERE id=?`,
        [id],
      )
    )?.venueId;
  const parentKey = cfg.via === "assets" ? "asset_id" : "extinguisher_id";
  return (
    await db.get<{ venueId: number }>(
      `SELECT p.venue_id venueId FROM ${cfg.table} c JOIN ${cfg.via} p ON p.id=c.${parentKey} WHERE c.id=?`,
      [id],
    )
  )?.venueId;
}
async function assertEntityReference(
  req: AuthedRequest,
  res: Response,
  type?: string | null,
  id?: number | null,
  expectedVenue?: number,
) {
  if (!type && !id) return true;
  if (!type || !id) {
    res
      .status(400)
      .json({ error: "Related type and ID must be supplied together" });
    return false;
  }
  const venue = await entityVenue(type, id);
  if (!venue || venue !== expectedVenue || !venueAllowed(req, venue)) {
    res
      .status(400)
      .json({ error: "Related record is not in the authorised venue" });
    return false;
  }
  return true;
}
async function assertDocument(
  req: AuthedRequest,
  res: Response,
  documentId?: number | null,
  expectedVenue?: number,
) {
  if (!documentId) return true;
  const doc = await db.get<{ venueId: number }>(
    "SELECT venue_id venueId FROM documents WHERE id=?",
    [documentId],
  );
  if (
    !doc ||
    doc.venueId !== expectedVenue ||
    !venueAllowed(req, doc.venueId)
  ) {
    res.status(400).json({ error: "Document is not in the authorised venue" });
    return false;
  }
  return true;
}

app.get("/api/bootstrap", async (req: AuthedRequest, res) => {
  if (isAdmin(req))
    return res.json({
      venues: await rows("SELECT * FROM venues"),
      locations: await rows(
        "SELECT * FROM locations WHERE active=1 ORDER BY name",
      ),
      documentTypes: await rows(
        "SELECT * FROM document_types WHERE active=1 ORDER BY name",
      ),
      demoMode: demoDataMode(),
    });
  res.json({
    venues: await rows("SELECT * FROM venues WHERE id=?", req.user!.venueId),
    locations: await rows(
      "SELECT * FROM locations WHERE active=1 AND venue_id=? ORDER BY name",
      req.user!.venueId,
    ),
    documentTypes: await rows(
      "SELECT * FROM document_types WHERE active=1 AND venue_id=? ORDER BY name",
      req.user!.venueId,
    ),
    demoMode: demoDataMode(),
  });
});

app.get("/api/dashboard", async (req: AuthedRequest, res) => {
  const v = isAdmin(req) ? [] : [req.user!.venueId];
  const where = v.length ? " WHERE venue_id=?" : "";
  const today = new Date().toISOString().slice(0, 10),
    soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const one = async (statement: string, ...params: any[]) =>
    Number((await db.get<any>(statement, params))?.n || 0);
  res.json({
    assets: await one(`SELECT count(*) n FROM assets${where}`, ...v),
    patRequired: await one(
      `SELECT count(*) n FROM assets${where}${where ? " AND" : " WHERE"} pat_status='PAT Required'`,
      ...v,
    ),
    patOverdue: await one(
      `SELECT count(*) n FROM assets a WHERE a.pat_status='PAT Required'${v.length ? " AND a.venue_id=?" : ""} AND COALESCE((SELECT max(next_date) FROM pat_tests p WHERE p.asset_id=a.id),'1900-01-01')<?`,
      ...v,
      today,
    ),
    patDueSoon: await one(
      `SELECT count(*) n FROM assets a WHERE a.pat_status='PAT Required'${v.length ? " AND a.venue_id=?" : ""} AND (SELECT max(next_date) FROM pat_tests p WHERE p.asset_id=a.id) BETWEEN ? AND ?`,
      ...v,
      today,
      soon,
    ),
    failed: await one(
      `SELECT count(*) n FROM pat_tests p JOIN assets a ON a.id=p.asset_id WHERE p.result='Fail'${v.length ? " AND a.venue_id=?" : ""}`,
      ...v,
    ),
    extinguishers: await one(
      `SELECT count(*) n FROM extinguishers${where}`,
      ...v,
    ),
    openActions: await one(
      `SELECT count(*) n FROM actions${where}${where ? " AND" : " WHERE"} status NOT IN ('Closed','Complete')`,
      ...v,
    ),
    expiredDocuments: await one(
      `SELECT count(*) n FROM documents${where}${where ? " AND" : " WHERE"} review_date<?`,
      ...v,
      today,
    ),
    documentsDueSoon: await one(
      `SELECT count(*) n FROM documents${where}${where ? " AND" : " WHERE"} review_date BETWEEN ? AND ?`,
      ...v,
      today,
      soon,
    ),
    furnishingEvidence: await one(
      `SELECT count(*) n FROM furnishings${where}${where ? " AND" : " WHERE"} fire_status IN ('Evidence required','Requires assessment')`,
      ...v,
    ),
  });
});

app.get("/api/assets/barcode/:barcode", async (req: AuthedRequest, res) => {
  const row = await (isAdmin(req)
    ? db.get("SELECT * FROM assets WHERE barcode=?", [
        String(req.params.barcode),
      ])
    : db.get("SELECT * FROM assets WHERE barcode=? AND venue_id=?", [
        String(req.params.barcode),
        req.user!.venueId,
      ]));
  if (!row)
    return res
      .status(404)
      .json({ error: "Unknown barcode", barcode: req.params.barcode });
  res.json(row);
});

const resources: Record<
  string,
  { table: string; schema: z.ZodObject<any>; location?: boolean }
> = {
  assets: { table: "assets", schema: resourceSchemas.assets, location: true },
  extinguishers: {
    table: "extinguishers",
    schema: resourceSchemas.extinguishers,
    location: true,
  },
  "fire-alarm-tests": {
    table: "fire_alarm_tests",
    schema: resourceSchemas["fire-alarm-tests"],
  },
  "fire-alarm-services": {
    table: "fire_alarm_services",
    schema: resourceSchemas["fire-alarm-services"],
  },
  "risk-assessments": {
    table: "risk_assessments",
    schema: resourceSchemas["risk-assessments"],
  },
  furnishings: {
    table: "furnishings",
    schema: resourceSchemas.furnishings,
    location: true,
  },
  documents: { table: "documents", schema: resourceSchemas.documents },
  actions: {
    table: "actions",
    schema: resourceSchemas.actions,
    location: true,
  },
};
async function validateReferences(
  req: AuthedRequest,
  res: Response,
  route: string,
  body: Record<string, any>,
  venueId: number,
) {
  if (
    !(await assertVenue(req, res, venueId)) ||
    !(await assertLocation(res, venueId, body.location_id))
  )
    return false;
  if (
    route === "actions" &&
    !(await assertEntityReference(
      req,
      res,
      body.related_type,
      body.related_id,
      venueId,
    ))
  )
    return false;
  if (route === "fire-alarm-tests") {
    const point = await db.get<{ venueId: number; active: number }>(
      "SELECT venue_id venueId,active FROM fire_alarm_call_points WHERE id=?",
      [body.call_point_id],
    );
    if (!point || point.venueId !== venueId || !point.active) {
      res.status(400).json({
        error:
          "Call point is invalid, inactive or outside the authorised venue",
      });
      return false;
    }
  }
  for (const key of [
    "document_id",
    "completion_document_id",
    "previous_version_id",
  ]) {
    if (
      body[key] &&
      !(await assertDocument(req, res, Number(body[key]), venueId))
    )
      return false;
  }
  return true;
}

app.get("/api/fire-alarm-call-points", async (req: AuthedRequest, res) => {
  const scope = isAdmin(req)
    ? { sql: "", values: [] }
    : { sql: " WHERE c.venue_id=?", values: [req.user!.venueId] };
  res.json(
    await rows(
      `SELECT c.*,l.name location_name,v.name venue_name,(SELECT max(t.test_datetime) FROM fire_alarm_tests t WHERE t.call_point_id=c.id) last_tested_at,(SELECT count(*) FROM fire_alarm_tests t WHERE t.call_point_id=c.id) test_count FROM fire_alarm_call_points c JOIN locations l ON l.id=c.location_id JOIN venues v ON v.id=c.venue_id${scope.sql} ORDER BY c.active DESC,c.code`,
      ...scope.values,
    ),
  );
});
app.post(
  "/api/fire-alarm-call-points",
  canAdmin,
  async (req: AuthedRequest, res) => {
    const parsed = callPointSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid call point", issues: parsed.error.flatten() });
    if (
      !(await assertVenue(req, res, parsed.data.venue_id)) ||
      !(await assertLocation(
        res,
        parsed.data.venue_id,
        parsed.data.location_id,
      ))
    )
      return;
    try {
      const values = parsed.data;
      const result = await db.run(
        "INSERT INTO fire_alarm_call_points(venue_id,code,description,location_id,panel_zone,active,notes,created_by) VALUES(?,?,?,?,?,?,?,?)",
        [
          values.venue_id,
          values.code,
          values.description,
          values.location_id,
          values.panel_zone ?? null,
          values.active,
          values.notes ?? null,
          req.user!.id,
        ],
      );
      const after = await db.get(
        "SELECT * FROM fire_alarm_call_points WHERE id=?",
        [result.lastInsertRowid],
      );
      await audit(
        "fire_alarm_call_points",
        result.lastInsertRowid,
        "create",
        null,
        after,
        req.user!.id,
        req.ip,
      );
      res.status(201).json(after);
    } catch {
      res.status(400).json({ error: "Call point could not be saved" });
    }
  },
);
app.patch(
  "/api/fire-alarm-call-points/:id",
  canAdmin,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id),
      before = await db.get<any>(
        "SELECT * FROM fire_alarm_call_points WHERE id=?",
        [id],
      );
    if (!before) return res.status(404).json({ error: "Call point not found" });
    const parsed = callPointSchema.partial().safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length)
      return res.status(400).json({ error: "Invalid call point" });
    const afterValues = { ...before, ...parsed.data };
    if (
      !(await assertVenue(req, res, Number(afterValues.venue_id))) ||
      !(await assertLocation(
        res,
        Number(afterValues.venue_id),
        Number(afterValues.location_id),
      ))
    )
      return;
    const cols = Object.keys(parsed.data);
    try {
      await db.run(
        `UPDATE fire_alarm_call_points SET ${cols.map((key) => `${key}=?`).join(",")},updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?`,
        [...Object.values(parsed.data), req.user!.id, id],
      );
      const after = await db.get(
        "SELECT * FROM fire_alarm_call_points WHERE id=?",
        [id],
      );
      await audit(
        "fire_alarm_call_points",
        id,
        "update",
        before,
        after,
        req.user!.id,
        req.ip,
      );
      res.json(after);
    } catch {
      res.status(400).json({ error: "Call point could not be saved" });
    }
  },
);

app.get("/api/fire-alarm-rotation", async (req: AuthedRequest, res) => {
  const venueId = isAdmin(req)
    ? Number(req.query.venue_id || 0)
    : Number(req.user!.venueId);
  if (!venueId || !(await assertVenue(req, res, venueId))) return;
  const setting = await db.get<{ warningDays: number }>(
    "SELECT call_point_warning_days warningDays FROM venue_settings WHERE venue_id=?",
    [venueId],
  );
  const warningDays = Number(setting?.warningDays || 28);
  const points = await rows<any>(
    "SELECT c.id,c.code,c.description,l.name location_name,(SELECT max(t.test_datetime) FROM fire_alarm_tests t WHERE t.call_point_id=c.id) last_tested_at,(SELECT count(*) FROM fire_alarm_tests t WHERE t.call_point_id=c.id) test_count FROM fire_alarm_call_points c JOIN locations l ON l.id=c.location_id WHERE c.venue_id=? AND c.active=1 ORDER BY CASE WHEN (SELECT max(t.test_datetime) FROM fire_alarm_tests t WHERE t.call_point_id=c.id) IS NULL THEN 0 ELSE 1 END,(SELECT max(t.test_datetime) FROM fire_alarm_tests t WHERE t.call_point_id=c.id),c.code",
    venueId,
  );
  const cutoff = Date.now() - warningDays * 864e5;
  res.json({
    warningDays,
    points: points.map((point) => ({
      ...point,
      overdue:
        !point.last_tested_at ||
        new Date(point.last_tested_at).getTime() < cutoff,
    })),
    nextCallPoint: points[0] || null,
  });
});

app.get(
  "/api/settings/master-data",
  canAdmin,
  async (req: AuthedRequest, res) => {
    const venueId = Number(req.query.venue_id);
    if (!(await assertVenue(req, res, venueId))) return;
    const setting = await db.get<any>(
      "SELECT * FROM venue_settings WHERE venue_id=?",
      [venueId],
    );
    res.json({
      settings: setting || { venue_id: venueId, call_point_warning_days: 28 },
      documentTypes: await rows(
        "SELECT * FROM document_types WHERE venue_id=? ORDER BY active DESC,name",
        venueId,
      ),
      locations: await rows(
        "SELECT * FROM locations WHERE venue_id=? ORDER BY active DESC,name",
        venueId,
      ),
    });
  },
);
app.put(
  "/api/settings/venues/:venueId",
  canAdmin,
  async (req: AuthedRequest, res) => {
    const venueId = Number(req.params.venueId),
      parsed = venueSettingsSchema.safeParse(req.body);
    if (!parsed.success || !(await assertVenue(req, res, venueId)))
      return parsed.success
        ? undefined
        : res.status(400).json({ error: "Invalid settings" });
    const existing = await db.get(
      "SELECT venue_id FROM venue_settings WHERE venue_id=?",
      [venueId],
    );
    if (existing)
      await db.run(
        "UPDATE venue_settings SET call_point_warning_days=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE venue_id=?",
        [parsed.data.call_point_warning_days, req.user!.id, venueId],
      );
    else
      await db.run(
        "INSERT INTO venue_settings(venue_id,call_point_warning_days,updated_by) VALUES(?,?,?)",
        [venueId, parsed.data.call_point_warning_days, req.user!.id],
      );
    await audit(
      "venue_settings",
      venueId,
      "update",
      existing,
      parsed.data,
      req.user!.id,
      req.ip,
    );
    res.json({ venue_id: venueId, ...parsed.data });
  },
);
app.post("/api/document-types", canAdmin, async (req: AuthedRequest, res) => {
  const parsed = documentTypeSchema.safeParse(req.body);
  if (
    !parsed.success ||
    !(await assertVenue(req, res, parsed.success ? parsed.data.venue_id : 0))
  )
    return parsed.success
      ? undefined
      : res.status(400).json({ error: "Invalid document type" });
  try {
    const result = await db.run(
      "INSERT INTO document_types(venue_id,name,active,created_by) VALUES(?,?,?,?)",
      [
        parsed.data.venue_id,
        parsed.data.name,
        parsed.data.active,
        req.user!.id,
      ],
    );
    const after = await db.get("SELECT * FROM document_types WHERE id=?", [
      result.lastInsertRowid,
    ]);
    await audit(
      "document_types",
      result.lastInsertRowid,
      "create",
      null,
      after,
      req.user!.id,
      req.ip,
    );
    res.status(201).json(after);
  } catch {
    res.status(400).json({ error: "Document type could not be saved" });
  }
});
app.patch(
  "/api/document-types/:id",
  canAdmin,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id),
      before = await db.get<any>("SELECT * FROM document_types WHERE id=?", [
        id,
      ]);
    if (!before)
      return res.status(404).json({ error: "Document type not found" });
    const parsed = documentTypeSchema.partial().safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length)
      return res.status(400).json({ error: "Invalid document type" });
    const targetVenue = Number(parsed.data.venue_id ?? before.venue_id);
    if (!(await assertVenue(req, res, targetVenue))) return;
    const cols = Object.keys(parsed.data);
    try {
      await db.run(
        `UPDATE document_types SET ${cols.map((key) => `${key}=?`).join(",")},updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?`,
        [...Object.values(parsed.data), req.user!.id, id],
      );
      const after = await db.get("SELECT * FROM document_types WHERE id=?", [
        id,
      ]);
      await audit(
        "document_types",
        id,
        "update",
        before,
        after,
        req.user!.id,
        req.ip,
      );
      res.json(after);
    } catch {
      res.status(400).json({ error: "Document type could not be saved" });
    }
  },
);
const locationBody = z
  .object({
    venue_id: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(250),
    active: z.coerce.number().int().min(0).max(1).default(1),
  })
  .strict();
app.post("/api/locations", canAdmin, async (req: AuthedRequest, res) => {
  const parsed = locationBody.safeParse(req.body);
  if (
    !parsed.success ||
    !(await assertVenue(req, res, parsed.success ? parsed.data.venue_id : 0))
  )
    return parsed.success
      ? undefined
      : res.status(400).json({ error: "Invalid location" });
  try {
    const result = await db.run(
      "INSERT INTO locations(venue_id,name,active) VALUES(?,?,?)",
      [parsed.data.venue_id, parsed.data.name, parsed.data.active],
    );
    const after = await db.get("SELECT * FROM locations WHERE id=?", [
      result.lastInsertRowid,
    ]);
    await audit(
      "locations",
      result.lastInsertRowid,
      "create",
      null,
      after,
      req.user!.id,
      req.ip,
    );
    res.status(201).json(after);
  } catch {
    res.status(400).json({ error: "Location could not be saved" });
  }
});
app.patch("/api/locations/:id", canAdmin, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id),
    before = await db.get<any>("SELECT * FROM locations WHERE id=?", [id]);
  if (!before) return res.status(404).json({ error: "Location not found" });
  const parsed = locationBody.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length)
    return res.status(400).json({ error: "Invalid location" });
  const targetVenue = Number(parsed.data.venue_id ?? before.venue_id);
  if (!(await assertVenue(req, res, targetVenue))) return;
  const cols = Object.keys(parsed.data);
  try {
    await db.run(
      `UPDATE locations SET ${cols.map((key) => `${key}=?`).join(",")} WHERE id=?`,
      [...Object.values(parsed.data), id],
    );
    const after = await db.get("SELECT * FROM locations WHERE id=?", [id]);
    await audit("locations", id, "update", before, after, req.user!.id, req.ip);
    res.json(after);
  } catch {
    res.status(400).json({ error: "Location could not be saved" });
  }
});

for (const [route, cfg] of Object.entries(resources)) {
  app.get(`/api/${route}`, async (req: AuthedRequest, res) => {
    const scoped = isAdmin(req)
      ? { sql: "", params: [] }
      : { sql: " WHERE t.venue_id=?", params: [req.user!.venueId] };
    const joinLocation = cfg.location
      ? " LEFT JOIN locations l ON l.id=t.location_id"
      : "";
    const locationColumn = cfg.location ? ",l.name location_name" : "";
    const attachmentColumn =
      route === "documents"
        ? ",(SELECT count(*) FROM document_attachments a WHERE a.document_id=t.id) attachment_count"
        : "";
    res.json(
      await rows(
        `SELECT t.*,v.name venue_name${locationColumn}${attachmentColumn} FROM ${cfg.table} t LEFT JOIN venues v ON v.id=t.venue_id${joinLocation}${scoped.sql} ORDER BY t.id DESC`,
        ...scoped.params,
      ),
    );
  });
  app.get(`/api/${route}/:id`, async (req: AuthedRequest, res) => {
    const row = await db.get<any>(`SELECT * FROM ${cfg.table} WHERE id=?`, [
      Number(req.params.id),
    ]);
    if (!row) return res.status(404).json({ error: "Not found" });
    if (!venueAllowed(req, row.venue_id))
      return res.status(403).json({ error: "Venue access denied" });
    res.json(row);
  });
  app.post(`/api/${route}`, canWrite, async (req: AuthedRequest, res) => {
    const parsed = cfg.schema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid record", issues: parsed.error.flatten() });
    const body = parsed.data as Record<string, any>,
      venueId = Number(body.venue_id);
    if (!(await validateReferences(req, res, route, body, venueId))) return;
    const cols = Object.keys(body),
      vals = Object.values(body);
    try {
      const result = await db.run(
        `INSERT INTO ${cfg.table}(${cols.join(",")},created_by) VALUES(${cols.map(() => "?").join(",")},?)`,
        [...vals, req.user!.id],
      );
      const id = Number(result.lastInsertRowid),
        after = await db.get(`SELECT * FROM ${cfg.table} WHERE id=?`, [id]);
      await audit(route, id, "create", null, after, req.user!.id, req.ip);
      res.status(201).json(after);
    } catch {
      res.status(400).json({ error: "Record could not be saved" });
    }
  });
  app.patch(`/api/${route}/:id`, canWrite, async (req: AuthedRequest, res) => {
    if (route === "fire-alarm-tests")
      return res
        .status(405)
        .json({ error: "Weekly test history is append-only" });
    const id = Number(req.params.id),
      before = await db.get<any>(`SELECT * FROM ${cfg.table} WHERE id=?`, [id]);
    if (!before) return res.status(404).json({ error: "Not found" });
    if (!venueAllowed(req, before.venue_id))
      return res.status(403).json({ error: "Venue access denied" });
    const parsed = cfg.schema.partial().safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length)
      return res.status(400).json({
        error: "Invalid record",
        issues: parsed.success ? undefined : parsed.error.flatten(),
      });
    const body = parsed.data as Record<string, any>;
    if (
      !isAdmin(req) &&
      body.venue_id !== undefined &&
      Number(body.venue_id) !== before.venue_id
    )
      return res.status(403).json({ error: "Venue access denied" });
    const targetVenue = Number(body.venue_id ?? before.venue_id);
    const targetLocation =
      body.location_id !== undefined ? body.location_id : before.location_id;
    if (
      !(await validateReferences(
        req,
        res,
        route,
        { ...before, ...body, location_id: targetLocation },
        targetVenue,
      ))
    )
      return;
    const cols = Object.keys(body);
    try {
      await db.run(
        `UPDATE ${cfg.table} SET ${cols.map((c) => `${c}=?`).join(",")},updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?`,
        [...Object.values(body), req.user!.id, id],
      );
      const after = await db.get(`SELECT * FROM ${cfg.table} WHERE id=?`, [id]);
      await audit(route, id, "update", before, after, req.user!.id, req.ip);
      res.json(after);
    } catch {
      res.status(400).json({ error: "Record could not be saved" });
    }
  });
}

app.get("/api/assets/:id/pat-tests", async (req: AuthedRequest, res) => {
  const asset = await db.get<{ venueId: number }>(
    "SELECT venue_id venueId FROM assets WHERE id=?",
    [Number(req.params.id)],
  );
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (!venueAllowed(req, asset.venueId))
    return res.status(403).json({ error: "Venue access denied" });
  res.json(
    await rows(
      "SELECT * FROM pat_tests WHERE asset_id=? ORDER BY test_date DESC,id DESC",
      Number(req.params.id),
    ),
  );
});
app.post(
  "/api/assets/:id/pat-tests",
  canWrite,
  async (req: AuthedRequest, res) => {
    const asset = await db.get<any>("SELECT * FROM assets WHERE id=?", [
      Number(req.params.id),
    ]);
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    if (!venueAllowed(req, asset.venue_id))
      return res.status(403).json({ error: "Venue access denied" });
    const parsed = patSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid PAT test", issues: parsed.error.flatten() });
    if (
      !(await assertDocument(req, res, parsed.data.document_id, asset.venue_id))
    )
      return;
    const cols = Object.keys(parsed.data),
      result = await db.run(
        `INSERT INTO pat_tests(asset_id,${cols.join(",")},created_by) VALUES(?,${cols.map(() => "?").join(",")},?)`,
        [asset.id, ...Object.values(parsed.data), req.user!.id],
      );
    const id = Number(result.lastInsertRowid),
      after = await db.get("SELECT * FROM pat_tests WHERE id=?", [id]);
    await audit("pat_tests", id, "create", null, after, req.user!.id, req.ip);
    res.status(201).json(after);
  },
);

app.get("/api/extinguishers/:id/checks", async (req: AuthedRequest, res) => {
  const item = await db.get<{ venueId: number }>(
    "SELECT venue_id venueId FROM extinguishers WHERE id=?",
    [Number(req.params.id)],
  );
  if (!item) return res.status(404).json({ error: "Extinguisher not found" });
  if (!venueAllowed(req, item.venueId))
    return res.status(403).json({ error: "Venue access denied" });
  res.json(
    await rows(
      "SELECT * FROM extinguisher_checks WHERE extinguisher_id=? ORDER BY check_date DESC,id DESC",
      Number(req.params.id),
    ),
  );
});
app.post(
  "/api/extinguishers/:id/checks",
  canWrite,
  async (req: AuthedRequest, res) => {
    const item = await db.get<any>("SELECT * FROM extinguishers WHERE id=?", [
      Number(req.params.id),
    ]);
    if (!item) return res.status(404).json({ error: "Extinguisher not found" });
    if (!venueAllowed(req, item.venue_id))
      return res.status(403).json({ error: "Venue access denied" });
    const parsed = extinguisherCheckSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid extinguisher check",
        issues: parsed.error.flatten(),
      });
    const cols = Object.keys(parsed.data),
      result = await db.run(
        `INSERT INTO extinguisher_checks(extinguisher_id,${cols.join(",")},created_by) VALUES(?,${cols.map(() => "?").join(",")},?)`,
        [item.id, ...Object.values(parsed.data), req.user!.id],
      );
    const id = Number(result.lastInsertRowid),
      after = await db.get("SELECT * FROM extinguisher_checks WHERE id=?", [
        id,
      ]);
    await audit(
      "extinguisher_checks",
      id,
      "create",
      null,
      after,
      req.user!.id,
      req.ip,
    );
    res.status(201).json(after);
  },
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) =>
    cb(
      null,
      [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/heif",
      ].includes(file.mimetype) ||
        /\.(pdf|jpe?g|png|heic|heif)$/i.test(file.originalname),
    ),
});

app.get("/api/documents/:id/attachments", async (req: AuthedRequest, res) => {
  const document = await db.get<any>(
    "SELECT venue_id FROM documents WHERE id=?",
    [Number(req.params.id)],
  );
  if (!document) return res.status(404).json({ error: "Document not found" });
  if (!venueAllowed(req, Number(document.venue_id)))
    return res.status(403).json({ error: "Venue access denied" });
  res.json(
    await rows(
      "SELECT a.id,a.document_id,a.original_name,a.mime_type,a.file_size,a.created_at,u.name uploaded_by FROM document_attachments a LEFT JOIN users u ON u.id=a.created_by WHERE a.document_id=? ORDER BY a.created_at DESC,a.id DESC",
      Number(req.params.id),
    ),
  );
});
app.post(
  "/api/documents/:id/attachments",
  canWrite,
  evidenceUpload.array("files", 10),
  async (req: AuthedRequest, res) => {
    const documentId = Number(req.params.id);
    const document = await db.get<any>(
      "SELECT venue_id FROM documents WHERE id=?",
      [documentId],
    );
    if (!document) return res.status(404).json({ error: "Document not found" });
    if (!venueAllowed(req, Number(document.venue_id)))
      return res.status(403).json({ error: "Venue access denied" });
    const files = (req.files || []) as Express.Multer.File[];
    if (!files.length)
      return res.status(400).json({
        error: "Select PDF, JPEG, PNG, HEIC or HEIF evidence files",
      });
    const created = [];
    for (const file of files) {
      const originalName = basename(file.originalname).slice(0, 500);
      const extension = originalName.split(".").pop()?.toLowerCase();
      const mimeType =
        file.mimetype === "application/octet-stream" || !file.mimetype
          ? extension === "heic"
            ? "image/heic"
            : extension === "heif"
              ? "image/heif"
              : file.mimetype
          : file.mimetype;
      const key = await storage.put(file.buffer, originalName, mimeType);
      const result = await db.run(
        "INSERT INTO document_attachments(document_id,storage_key,original_name,mime_type,file_size,created_by) VALUES(?,?,?,?,?,?)",
        [documentId, key, originalName, mimeType, file.size, req.user!.id],
      );
      const attachment = await db.get(
        "SELECT id,document_id,original_name,mime_type,file_size,created_at FROM document_attachments WHERE id=?",
        [result.lastInsertRowid],
      );
      await audit(
        "document_attachments",
        result.lastInsertRowid,
        "create",
        null,
        attachment,
        req.user!.id,
        req.ip,
      );
      created.push(attachment);
    }
    res.status(201).json(created);
  },
);

app.get(
  "/api/document-attachments/:id/file",
  async (req: AuthedRequest, res) => {
    const attachment = await db.get<any>(
      "SELECT a.*,d.venue_id FROM document_attachments a JOIN documents d ON d.id=a.document_id WHERE a.id=?",
      [Number(req.params.id)],
    );
    if (!attachment) return res.status(404).end();
    if (!venueAllowed(req, Number(attachment.venue_id)))
      return res.status(403).end();
    try {
      const object = await storage.get(attachment.storage_key);
      res.type(
        attachment.mime_type ||
          object.contentType ||
          "application/octet-stream",
      );
      if (object.length) res.setHeader("Content-Length", String(object.length));
      const safeName = String(attachment.original_name).replace(
        /["\r\n]/g,
        "_",
      );
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
      res.setHeader("Cache-Control", "private, no-store");
      object.stream.pipe(res);
    } catch {
      res.status(404).end();
    }
  },
);
app.get("/api/:entityType/:id/photos", async (req: AuthedRequest, res) => {
  const type = String(req.params.entityType).replace(/s$/, ""),
    id = Number(req.params.id),
    venue = await entityVenue(type, id);
  if (!venue) return res.status(404).json({ error: "Record not found" });
  if (!venueAllowed(req, venue))
    return res.status(403).json({ error: "Venue access denied" });
  res.json(
    await rows(
      "SELECT * FROM photos WHERE entity_type=? AND entity_id=? ORDER BY is_main DESC,captured_at DESC,created_at DESC",
      type,
      id,
    ),
  );
});
app.post(
  "/api/:entityType/:id/photos",
  canWrite,
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    const type = String(req.params.entityType).replace(/s$/, ""),
      id = Number(req.params.id);
    if (
      ![
        "asset",
        "furnishing",
        "extinguisher_check",
        "fire_alarm_call_point",
        "fire_alarm_test",
      ].includes(type)
    )
      return res.status(400).json({ error: "Unsupported photo target" });
    const venue = await entityVenue(type, id);
    if (!venue) return res.status(404).json({ error: "Record not found" });
    if (!venueAllowed(req, venue))
      return res.status(403).json({ error: "Venue access denied" });
    if (!req.file)
      return res
        .status(400)
        .json({ error: "JPEG, PNG or WebP image required" });
    const metadata = photoMetadataSchema.safeParse(req.body);
    if (!metadata.success)
      return res.status(400).json({ error: "Invalid photo metadata" });
    const key = await storage.put(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      ),
      captured = metadata.data.captured_at || new Date().toISOString();
    if (metadata.data.is_main)
      await db.run(
        "UPDATE photos SET is_main=0 WHERE entity_type=? AND entity_id=?",
        [type, id],
      );
    const result = await db.run(
      "INSERT INTO photos(entity_type,entity_id,storage_key,mime_type,captured_at,caption,is_main,created_by) VALUES(?,?,?,?,?,?,?,?)",
      [
        type,
        id,
        key,
        req.file.mimetype,
        captured,
        metadata.data.caption || null,
        metadata.data.is_main,
        req.user!.id,
      ],
    );
    const photoId = Number(result.lastInsertRowid),
      after = await db.get("SELECT * FROM photos WHERE id=?", [photoId]);
    await audit("photos", photoId, "create", null, after, req.user!.id, req.ip);
    res.status(201).json(after);
  },
);
app.patch("/api/photos/:id/main", canWrite, async (req: AuthedRequest, res) => {
  const photo = await db.get<any>("SELECT * FROM photos WHERE id=?", [
    Number(req.params.id),
  ]);
  if (!photo) return res.status(404).json({ error: "Photo not found" });
  const venue = await entityVenue(photo.entity_type, photo.entity_id);
  if (!venue || !venueAllowed(req, venue))
    return res.status(403).json({ error: "Venue access denied" });
  await db.run(
    "UPDATE photos SET is_main=0 WHERE entity_type=? AND entity_id=?",
    [photo.entity_type, photo.entity_id],
  );
  await db.run("UPDATE photos SET is_main=1 WHERE id=?", [photo.id]);
  await audit(
    "photos",
    photo.id,
    "set_main",
    photo,
    { ...photo, is_main: 1 },
    req.user!.id,
    req.ip,
  );
  res.json({ ...photo, is_main: 1 });
});

app.post(
  "/api/documents/:id/links",
  canWrite,
  async (req: AuthedRequest, res) => {
    const doc = await db.get<any>("SELECT * FROM documents WHERE id=?", [
      Number(req.params.id),
    ]);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (!venueAllowed(req, doc.venue_id))
      return res.status(403).json({ error: "Venue access denied" });
    const parsed = documentLinkSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid document link" });
    if (
      !(await assertEntityReference(
        req,
        res,
        parsed.data.entity_type,
        parsed.data.entity_id,
        doc.venue_id,
      ))
    )
      return;
    const result = await db.run(
      "INSERT INTO document_links(document_id,entity_type,entity_id) VALUES(?,?,?)",
      [doc.id, parsed.data.entity_type, parsed.data.entity_id],
    );
    await audit(
      "document_links",
      Number(result.lastInsertRowid),
      "create",
      null,
      parsed.data,
      req.user!.id,
      req.ip,
    );
    res.status(201).json(parsed.data);
  },
);
app.get("/api/documents/:id/links", async (req: AuthedRequest, res) => {
  const document = await db.get<any>(
    "SELECT venue_id FROM documents WHERE id=?",
    [Number(req.params.id)],
  );
  if (!document) return res.status(404).json({ error: "Document not found" });
  if (!venueAllowed(req, Number(document.venue_id)))
    return res.status(403).json({ error: "Venue access denied" });
  res.json(
    await rows(
      "SELECT id,entity_type,entity_id FROM document_links WHERE document_id=? ORDER BY id",
      Number(req.params.id),
    ),
  );
});

app.get(/^\/files\/(.+)$/, authenticate, async (req: AuthedRequest, res) => {
  const key = String(req.params[0]);
  const photo = await db.get<{ entityType: string; entityId: number }>(
    "SELECT entity_type entityType,entity_id entityId FROM photos WHERE storage_key=?",
    [key],
  );
  const document = await db.get<{ venueId: number }>(
    "SELECT venue_id venueId FROM documents WHERE storage_key=?",
    [key],
  );
  const attachment = await db.get<{ venueId: number }>(
    "SELECT d.venue_id venueId FROM document_attachments a JOIN documents d ON d.id=a.document_id WHERE a.storage_key=?",
    [key],
  );
  const venue = photo
    ? await entityVenue(photo.entityType, photo.entityId)
    : (document?.venueId ?? attachment?.venueId);
  if (!venue) return res.status(404).end();
  if (!venueAllowed(req, venue)) return res.status(403).end();
  try {
    const object = await storage.get(key);
    if (object.contentType) res.type(object.contentType);
    if (object.length) res.setHeader("Content-Length", String(object.length));
    res.setHeader("Cache-Control", "private, no-store");
    object.stream.pipe(res);
  } catch {
    res.status(404).end();
  }
});

app.get("/api/audit", allow("administrator", "auditor"), async (_req, res) =>
  res.json(
    await rows(
      "SELECT a.*,u.name user_name FROM audit_events a LEFT JOIN users u ON u.id=a.user_id ORDER BY occurred_at DESC LIMIT 500",
    ),
  ),
);
app.get("/api/users", canAdmin, async (_req, res) =>
  res.json(
    await rows(
      "SELECT id,email,name,role,venue_id,active,created_at FROM users",
    ),
  ),
);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError)
    return res.status(400).json({
      error: "Upload exceeds the 15 MB per-file limit or 10-file limit",
    });
  console.error(error);
  res.status(500).json({ error: "Unexpected server error" });
});
if (config.NODE_ENV === "production") {
  const frontend = resolve(process.cwd(), "dist");
  app.use(express.static(frontend, { index: false, fallthrough: true }));
  app.get(/^(?!\/api(?:\/|$)|\/files(?:\/|$)|\/health$).*/, (_req, res) =>
    res.sendFile(resolve(frontend, "index.html")),
  );
}
const port = config.PORT;
if (config.NODE_ENV !== "test")
  app.listen(port, () =>
    console.log(`Compliance API on http://localhost:${port}`),
  );
export default app;
