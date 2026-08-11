import "dotenv/config";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
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
import { config } from "./config.js";
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
  documentLinkSchema,
  extinguisherCheckSchema,
  patSchema,
  photoMetadataSchema,
  resourceSchemas,
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
    });
  res.json({
    venues: await rows("SELECT * FROM venues WHERE id=?", req.user!.venueId),
    locations: await rows(
      "SELECT * FROM locations WHERE active=1 AND venue_id=? ORDER BY name",
      req.user!.venueId,
    ),
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

for (const [route, cfg] of Object.entries(resources)) {
  app.get(`/api/${route}`, async (req: AuthedRequest, res) => {
    const scoped = isAdmin(req)
      ? { sql: "", params: [] }
      : { sql: " WHERE t.venue_id=?", params: [req.user!.venueId] };
    const joinLocation = cfg.location
      ? " LEFT JOIN locations l ON l.id=t.location_id"
      : "";
    const locationColumn = cfg.location ? ",l.name location_name" : "";
    res.json(
      await rows(
        `SELECT t.*,v.name venue_name${locationColumn} FROM ${cfg.table} t LEFT JOIN venues v ON v.id=t.venue_id${joinLocation}${scoped.sql} ORDER BY t.id DESC`,
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
    if (!["asset", "furnishing", "extinguisher_check"].includes(type))
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
  const venue = photo
    ? await entityVenue(photo.entityType, photo.entityId)
    : document?.venueId;
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
