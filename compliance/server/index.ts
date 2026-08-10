import "dotenv/config";
import { createHash } from "node:crypto";
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
import { db, migrate, rows, audit } from "./db.js";
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

migrate();
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
  (req, res) => {
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
      ? (db
          .prepare(
            "SELECT id,email,name,role,venue_id venueId,password_hash passwordHash,active FROM users WHERE lower(email)=?",
          )
          .get(email) as
          | (Record<string, unknown> & { passwordHash: string; active: number })
          | undefined)
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
      audit(
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
    audit("session", null, "login", null, { userId: safe.id }, safe.id, req.ip);
    res.json({ token: tokenFor(safe), user: safe });
  },
);

app.use("/api", authenticate);
app.get("/api/me", (req: AuthedRequest, res) => res.json(req.user));

const isAdmin = (req: AuthedRequest) => req.user!.role === "administrator";
function venueAllowed(req: AuthedRequest, venueId: number) {
  return isAdmin(req) || req.user!.venueId === venueId;
}
function assertVenue(req: AuthedRequest, res: Response, venueId: number) {
  if (!venueAllowed(req, venueId)) {
    res.status(403).json({ error: "Venue access denied" });
    return false;
  }
  if (!db.prepare("SELECT id FROM venues WHERE id=?").get(venueId)) {
    res.status(400).json({ error: "Invalid venue" });
    return false;
  }
  return true;
}
function assertLocation(
  res: Response,
  venueId: number,
  locationId?: number | null,
) {
  if (locationId == null) return true;
  const found = db
    .prepare("SELECT id FROM locations WHERE id=? AND venue_id=? AND active=1")
    .get(locationId, venueId);
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
function entityVenue(type: string, id: number): number | undefined {
  const cfg = entityTables[type];
  if (!cfg) return undefined;
  if (!cfg.via)
    return (
      db
        .prepare(`SELECT venue_id venueId FROM ${cfg.table} WHERE id=?`)
        .get(id) as { venueId: number } | undefined
    )?.venueId;
  const parentKey = cfg.via === "assets" ? "asset_id" : "extinguisher_id";
  return (
    db
      .prepare(
        `SELECT p.venue_id venueId FROM ${cfg.table} c JOIN ${cfg.via} p ON p.id=c.${parentKey} WHERE c.id=?`,
      )
      .get(id) as { venueId: number } | undefined
  )?.venueId;
}
function assertEntityReference(
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
  const venue = entityVenue(type, id);
  if (!venue || venue !== expectedVenue || !venueAllowed(req, venue)) {
    res
      .status(400)
      .json({ error: "Related record is not in the authorised venue" });
    return false;
  }
  return true;
}
function assertDocument(
  req: AuthedRequest,
  res: Response,
  documentId?: number | null,
  expectedVenue?: number,
) {
  if (!documentId) return true;
  const doc = db
    .prepare("SELECT venue_id venueId FROM documents WHERE id=?")
    .get(documentId) as { venueId: number } | undefined;
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

app.get("/api/bootstrap", (req: AuthedRequest, res) => {
  if (isAdmin(req))
    return res.json({
      venues: rows("SELECT * FROM venues"),
      locations: rows("SELECT * FROM locations WHERE active=1 ORDER BY name"),
    });
  res.json({
    venues: rows("SELECT * FROM venues WHERE id=?", req.user!.venueId),
    locations: rows(
      "SELECT * FROM locations WHERE active=1 AND venue_id=? ORDER BY name",
      req.user!.venueId,
    ),
  });
});

app.get("/api/dashboard", (req: AuthedRequest, res) => {
  const v = isAdmin(req) ? [] : [req.user!.venueId];
  const where = v.length ? " WHERE venue_id=?" : "";
  const today = new Date().toISOString().slice(0, 10),
    soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const one = (sql: string, ...p: any[]) =>
    Number((db.prepare(sql).get(...p) as any).n);
  res.json({
    assets: one(`SELECT count(*) n FROM assets${where}`, ...v),
    patRequired: one(
      `SELECT count(*) n FROM assets${where}${where ? " AND" : " WHERE"} pat_status='PAT Required'`,
      ...v,
    ),
    patOverdue: one(
      `SELECT count(*) n FROM assets a WHERE a.pat_status='PAT Required'${v.length ? " AND a.venue_id=?" : ""} AND COALESCE((SELECT max(next_date) FROM pat_tests p WHERE p.asset_id=a.id),'1900-01-01')<?`,
      ...v,
      today,
    ),
    patDueSoon: one(
      `SELECT count(*) n FROM assets a WHERE a.pat_status='PAT Required'${v.length ? " AND a.venue_id=?" : ""} AND (SELECT max(next_date) FROM pat_tests p WHERE p.asset_id=a.id) BETWEEN ? AND ?`,
      ...v,
      today,
      soon,
    ),
    failed: one(
      `SELECT count(*) n FROM pat_tests p JOIN assets a ON a.id=p.asset_id WHERE p.result='Fail'${v.length ? " AND a.venue_id=?" : ""}`,
      ...v,
    ),
    extinguishers: one(`SELECT count(*) n FROM extinguishers${where}`, ...v),
    openActions: one(
      `SELECT count(*) n FROM actions${where}${where ? " AND" : " WHERE"} status NOT IN ('Closed','Complete')`,
      ...v,
    ),
    expiredDocuments: one(
      `SELECT count(*) n FROM documents${where}${where ? " AND" : " WHERE"} review_date<?`,
      ...v,
      today,
    ),
    furnishingEvidence: one(
      `SELECT count(*) n FROM furnishings${where}${where ? " AND" : " WHERE"} fire_status IN ('Evidence required','Requires assessment')`,
      ...v,
    ),
  });
});

app.get("/api/assets/barcode/:barcode", (req: AuthedRequest, res) => {
  const row = (
    isAdmin(req)
      ? db
          .prepare("SELECT * FROM assets WHERE barcode=?")
          .get(String(req.params.barcode))
      : db
          .prepare("SELECT * FROM assets WHERE barcode=? AND venue_id=?")
          .get(String(req.params.barcode), req.user!.venueId)
  ) as any;
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
function validateReferences(
  req: AuthedRequest,
  res: Response,
  route: string,
  body: Record<string, any>,
  venueId: number,
) {
  if (
    !assertVenue(req, res, venueId) ||
    !assertLocation(res, venueId, body.location_id)
  )
    return false;
  if (
    route === "actions" &&
    !assertEntityReference(
      req,
      res,
      body.related_type,
      body.related_id,
      venueId,
    )
  )
    return false;
  for (const key of [
    "document_id",
    "completion_document_id",
    "previous_version_id",
  ]) {
    if (body[key] && !assertDocument(req, res, Number(body[key]), venueId))
      return false;
  }
  return true;
}

for (const [route, cfg] of Object.entries(resources)) {
  app.get(`/api/${route}`, (req: AuthedRequest, res) => {
    const scoped = isAdmin(req)
      ? { sql: "", params: [] }
      : { sql: " WHERE t.venue_id=?", params: [req.user!.venueId] };
    const joinLocation = cfg.location
      ? " LEFT JOIN locations l ON l.id=t.location_id"
      : "";
    const locationColumn = cfg.location ? ",l.name location_name" : "";
    res.json(
      rows(
        `SELECT t.*,v.name venue_name${locationColumn} FROM ${cfg.table} t LEFT JOIN venues v ON v.id=t.venue_id${joinLocation}${scoped.sql} ORDER BY t.id DESC`,
        ...scoped.params,
      ),
    );
  });
  app.get(`/api/${route}/:id`, (req: AuthedRequest, res) => {
    const row = db
      .prepare(`SELECT * FROM ${cfg.table} WHERE id=?`)
      .get(Number(req.params.id)) as any;
    if (!row) return res.status(404).json({ error: "Not found" });
    if (!venueAllowed(req, row.venue_id))
      return res.status(403).json({ error: "Venue access denied" });
    res.json(row);
  });
  app.post(`/api/${route}`, canWrite, (req: AuthedRequest, res) => {
    const parsed = cfg.schema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid record", issues: parsed.error.flatten() });
    const body = parsed.data as Record<string, any>,
      venueId = Number(body.venue_id);
    if (!validateReferences(req, res, route, body, venueId)) return;
    const cols = Object.keys(body),
      vals = Object.values(body);
    try {
      const result = db
        .prepare(
          `INSERT INTO ${cfg.table}(${cols.join(",")},created_by) VALUES(${cols.map(() => "?").join(",")},?)`,
        )
        .run(...vals, req.user!.id);
      const id = Number(result.lastInsertRowid),
        after = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(id);
      audit(route, id, "create", null, after, req.user!.id, req.ip);
      res.status(201).json(after);
    } catch {
      res.status(400).json({ error: "Record could not be saved" });
    }
  });
  app.patch(`/api/${route}/:id`, canWrite, (req: AuthedRequest, res) => {
    const id = Number(req.params.id),
      before = db
        .prepare(`SELECT * FROM ${cfg.table} WHERE id=?`)
        .get(id) as any;
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
      !validateReferences(
        req,
        res,
        route,
        { ...before, ...body, location_id: targetLocation },
        targetVenue,
      )
    )
      return;
    const cols = Object.keys(body);
    try {
      db.prepare(
        `UPDATE ${cfg.table} SET ${cols.map((c) => `${c}=?`).join(",")},updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?`,
      ).run(...Object.values(body), req.user!.id, id);
      const after = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(id);
      audit(route, id, "update", before, after, req.user!.id, req.ip);
      res.json(after);
    } catch {
      res.status(400).json({ error: "Record could not be saved" });
    }
  });
}

app.get("/api/assets/:id/pat-tests", (req: AuthedRequest, res) => {
  const asset = db
    .prepare("SELECT venue_id venueId FROM assets WHERE id=?")
    .get(Number(req.params.id)) as { venueId: number } | undefined;
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (!venueAllowed(req, asset.venueId))
    return res.status(403).json({ error: "Venue access denied" });
  res.json(
    rows(
      "SELECT * FROM pat_tests WHERE asset_id=? ORDER BY test_date DESC,id DESC",
      Number(req.params.id),
    ),
  );
});
app.post("/api/assets/:id/pat-tests", canWrite, (req: AuthedRequest, res) => {
  const asset = db
    .prepare("SELECT * FROM assets WHERE id=?")
    .get(Number(req.params.id)) as any;
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (!venueAllowed(req, asset.venue_id))
    return res.status(403).json({ error: "Venue access denied" });
  const parsed = patSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Invalid PAT test", issues: parsed.error.flatten() });
  if (!assertDocument(req, res, parsed.data.document_id, asset.venue_id))
    return;
  const cols = Object.keys(parsed.data),
    result = db
      .prepare(
        `INSERT INTO pat_tests(asset_id,${cols.join(",")},created_by) VALUES(?,${cols.map(() => "?").join(",")},?)`,
      )
      .run(asset.id, ...Object.values(parsed.data), req.user!.id);
  const id = Number(result.lastInsertRowid),
    after = db.prepare("SELECT * FROM pat_tests WHERE id=?").get(id);
  audit("pat_tests", id, "create", null, after, req.user!.id, req.ip);
  res.status(201).json(after);
});

app.get("/api/extinguishers/:id/checks", (req: AuthedRequest, res) => {
  const item = db
    .prepare("SELECT venue_id venueId FROM extinguishers WHERE id=?")
    .get(Number(req.params.id)) as { venueId: number } | undefined;
  if (!item) return res.status(404).json({ error: "Extinguisher not found" });
  if (!venueAllowed(req, item.venueId))
    return res.status(403).json({ error: "Venue access denied" });
  res.json(
    rows(
      "SELECT * FROM extinguisher_checks WHERE extinguisher_id=? ORDER BY check_date DESC,id DESC",
      Number(req.params.id),
    ),
  );
});
app.post(
  "/api/extinguishers/:id/checks",
  canWrite,
  (req: AuthedRequest, res) => {
    const item = db
      .prepare("SELECT * FROM extinguishers WHERE id=?")
      .get(Number(req.params.id)) as any;
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
      result = db
        .prepare(
          `INSERT INTO extinguisher_checks(extinguisher_id,${cols.join(",")},created_by) VALUES(?,${cols.map(() => "?").join(",")},?)`,
        )
        .run(item.id, ...Object.values(parsed.data), req.user!.id);
    const id = Number(result.lastInsertRowid),
      after = db
        .prepare("SELECT * FROM extinguisher_checks WHERE id=?")
        .get(id);
    audit(
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
app.get("/api/:entityType/:id/photos", (req: AuthedRequest, res) => {
  const type = String(req.params.entityType).replace(/s$/, ""),
    id = Number(req.params.id),
    venue = entityVenue(type, id);
  if (!venue) return res.status(404).json({ error: "Record not found" });
  if (!venueAllowed(req, venue))
    return res.status(403).json({ error: "Venue access denied" });
  res.json(
    rows(
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
    const venue = entityVenue(type, id);
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
    const key = await storage.put(req.file.buffer, req.file.originalname),
      captured = metadata.data.captured_at || new Date().toISOString();
    if (metadata.data.is_main)
      db.prepare(
        "UPDATE photos SET is_main=0 WHERE entity_type=? AND entity_id=?",
      ).run(type, id);
    const result = db
      .prepare(
        "INSERT INTO photos(entity_type,entity_id,storage_key,mime_type,captured_at,caption,is_main,created_by) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        type,
        id,
        key,
        req.file.mimetype,
        captured,
        metadata.data.caption || null,
        metadata.data.is_main,
        req.user!.id,
      );
    const photoId = Number(result.lastInsertRowid),
      after = db.prepare("SELECT * FROM photos WHERE id=?").get(photoId);
    audit("photos", photoId, "create", null, after, req.user!.id, req.ip);
    res.status(201).json(after);
  },
);
app.patch("/api/photos/:id/main", canWrite, (req: AuthedRequest, res) => {
  const photo = db
    .prepare("SELECT * FROM photos WHERE id=?")
    .get(Number(req.params.id)) as any;
  if (!photo) return res.status(404).json({ error: "Photo not found" });
  const venue = entityVenue(photo.entity_type, photo.entity_id);
  if (!venue || !venueAllowed(req, venue))
    return res.status(403).json({ error: "Venue access denied" });
  db.prepare(
    "UPDATE photos SET is_main=0 WHERE entity_type=? AND entity_id=?",
  ).run(photo.entity_type, photo.entity_id);
  db.prepare("UPDATE photos SET is_main=1 WHERE id=?").run(photo.id);
  audit(
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

app.post("/api/documents/:id/links", canWrite, (req: AuthedRequest, res) => {
  const doc = db
    .prepare("SELECT * FROM documents WHERE id=?")
    .get(Number(req.params.id)) as any;
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (!venueAllowed(req, doc.venue_id))
    return res.status(403).json({ error: "Venue access denied" });
  const parsed = documentLinkSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid document link" });
  if (
    !assertEntityReference(
      req,
      res,
      parsed.data.entity_type,
      parsed.data.entity_id,
      doc.venue_id,
    )
  )
    return;
  const result = db
    .prepare(
      "INSERT INTO document_links(document_id,entity_type,entity_id) VALUES(?,?,?)",
    )
    .run(doc.id, parsed.data.entity_type, parsed.data.entity_id);
  audit(
    "document_links",
    Number(result.lastInsertRowid),
    "create",
    null,
    parsed.data,
    req.user!.id,
    req.ip,
  );
  res.status(201).json(parsed.data);
});

app.get(/^\/files\/(.+)$/, authenticate, (req: AuthedRequest, res) => {
  const key = String(req.params[0]);
  const photo = db
    .prepare(
      "SELECT entity_type entityType,entity_id entityId FROM photos WHERE storage_key=?",
    )
    .get(key) as { entityType: string; entityId: number } | undefined;
  const document = db
    .prepare("SELECT venue_id venueId FROM documents WHERE storage_key=?")
    .get(key) as { venueId: number } | undefined;
  const venue = photo
    ? entityVenue(photo.entityType, photo.entityId)
    : document?.venueId;
  if (!venue) return res.status(404).end();
  if (!venueAllowed(req, venue)) return res.status(403).end();
  try {
    storage.stream(key).pipe(res);
  } catch {
    res.status(404).end();
  }
});

app.get("/api/audit", allow("administrator", "auditor"), (_req, res) =>
  res.json(
    rows(
      "SELECT a.*,u.name user_name FROM audit_events a LEFT JOIN users u ON u.id=a.user_id ORDER BY occurred_at DESC LIMIT 500",
    ),
  ),
);
app.get("/api/users", canAdmin, (_req, res) =>
  res.json(
    rows("SELECT id,email,name,role,venue_id,active,created_at FROM users"),
  ),
);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Unexpected server error" });
});
const port = Number(process.env.PORT || 4100);
if (process.env.NODE_ENV !== "test")
  app.listen(port, () =>
    console.log(`Compliance API on http://localhost:${port}`),
  );
export default app;
