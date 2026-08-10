import "dotenv/config";
import express from "express";
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
migrate();
const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_q, r) =>
  r.json({ ok: true, service: "vl-compliance" }),
);
app.post("/api/auth/login", (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(8) })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Valid credentials required" });
  const user = db
    .prepare(
      "SELECT id,email,name,role,venue_id venueId,password_hash passwordHash,active FROM users WHERE lower(email)=lower(?)",
    )
    .get(parsed.data.email) as any;
  if (
    !user?.active ||
    !bcrypt.compareSync(parsed.data.password, user.passwordHash)
  )
    return res.status(401).json({ error: "Invalid email or password" });
  const safe = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    venueId: user.venueId,
  };
  audit("session", null, "login", null, { email: user.email }, user.id, req.ip);
  res.json({ token: tokenFor(safe), user: safe });
});
app.use("/api", authenticate);
app.get("/api/me", (req: AuthedRequest, res) => res.json(req.user));
app.get("/api/bootstrap", (req: AuthedRequest, res) => {
  const venueFilter =
    req.user!.role === "administrator"
      ? "1=1"
      : "id=" + Number(req.user!.venueId);
  res.json({
    venues: rows(`SELECT * FROM venues WHERE ${venueFilter}`),
    locations: rows("SELECT * FROM locations WHERE active=1 ORDER BY name"),
  });
});
app.get("/api/dashboard", (req: AuthedRequest, res) => {
  const v = req.user!.role === "administrator" ? [] : [req.user!.venueId];
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
const resources: {
  [k: string]: { table: string; required: string[]; venue?: boolean };
} = {
  assets: {
    table: "assets",
    required: ["barcode", "description", "venue_id"],
    venue: true,
  },
  extinguishers: {
    table: "extinguishers",
    required: ["barcode", "type", "venue_id"],
    venue: true,
  },
  "fire-alarm-tests": {
    table: "fire_alarm_tests",
    required: ["venue_id", "test_datetime", "result"],
    venue: true,
  },
  "fire-alarm-services": {
    table: "fire_alarm_services",
    required: ["venue_id", "service_date"],
    venue: true,
  },
  "risk-assessments": {
    table: "risk_assessments",
    required: ["venue_id", "assessment_date"],
    venue: true,
  },
  furnishings: {
    table: "furnishings",
    required: ["description", "venue_id", "fire_status"],
    venue: true,
  },
  documents: {
    table: "documents",
    required: ["venue_id", "type", "title"],
    venue: true,
  },
  actions: {
    table: "actions",
    required: ["description", "venue_id"],
    venue: true,
  },
};
const safeCols = (o: any): Record<string, any> =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([k, v]) =>
        /^[a-z_]+$/.test(k) &&
        v !== undefined &&
        ![
          "id",
          "created_at",
          "created_by",
          "updated_at",
          "updated_by",
        ].includes(k),
    ),
  );
for (const [route, cfg] of Object.entries(resources)) {
  app.get("/api/" + route, (req: AuthedRequest, res) => {
    const params: any[] = [];
    let where = "";
    if (cfg.venue && req.user!.role !== "administrator") {
      where = " WHERE t.venue_id=?";
      params.push(req.user!.venueId);
    }
    const data = rows(
      `SELECT t.*,v.name venue_name${["assets", "extinguishers", "furnishings", "actions"].includes(route) ? ",l.name location_name" : ""} FROM ${cfg.table} t LEFT JOIN venues v ON v.id=t.venue_id ${["assets", "extinguishers", "furnishings", "actions"].includes(route) ? "LEFT JOIN locations l ON l.id=t.location_id" : ""}${where} ORDER BY t.id DESC`,
      ...params,
    );
    res.json(data);
  });
  app.get("/api/" + route + "/:id", (req: AuthedRequest, res) => {
    const row = db
      .prepare(`SELECT * FROM ${cfg.table} WHERE id=?`)
      .get(Number(req.params.id)) as any;
    if (!row) return res.status(404).json({ error: "Not found" });
    if (
      cfg.venue &&
      req.user!.role !== "administrator" &&
      row.venue_id !== req.user!.venueId
    )
      return res.status(403).json({ error: "Venue access denied" });
    res.json(row);
  });
  app.post("/api/" + route, canWrite, (req: AuthedRequest, res) => {
    const body = safeCols(req.body);
    for (const f of cfg.required)
      if (body[f] === undefined || body[f] === "")
        return res.status(400).json({ error: `${f} is required` });
    if (
      cfg.venue &&
      req.user!.role !== "administrator" &&
      Number(body.venue_id) !== req.user!.venueId
    )
      return res.status(403).json({ error: "Venue access denied" });
    const cols = Object.keys(body),
      vals = Object.values(body);
    try {
      const result = db
        .prepare(
          `INSERT INTO ${cfg.table}(${cols.join(",")},created_by) VALUES(${cols.map(() => "?").join(",")},?)`,
        )
        .run(...vals, req.user!.id);
      const id = Number(result.lastInsertRowid);
      const after = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(id);
      audit(route, id, "create", null, after, req.user!.id, req.ip);
      res.status(201).json(after);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
  app.patch("/api/" + route + "/:id", canWrite, (req: AuthedRequest, res) => {
    const id = Number(req.params.id),
      before = db
        .prepare(`SELECT * FROM ${cfg.table} WHERE id=?`)
        .get(id) as any;
    if (!before) return res.status(404).json({ error: "Not found" });
    if (
      cfg.venue &&
      req.user!.role !== "administrator" &&
      before.venue_id !== req.user!.venueId
    )
      return res.status(403).json({ error: "Venue access denied" });
    const body = safeCols(req.body),
      cols = Object.keys(body);
    if (!cols.length)
      return res.status(400).json({ error: "No fields supplied" });
    db.prepare(
      `UPDATE ${cfg.table} SET ${cols.map((c) => `${c}=?`).join(",")},updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=?`,
    ).run(...Object.values(body), req.user!.id, id);
    const after = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(id);
    audit(route, id, "update", before, after, req.user!.id, req.ip);
    res.json(after);
  });
}
app.get("/api/assets/barcode/:barcode", (req: AuthedRequest, res) => {
  const row = db
    .prepare("SELECT * FROM assets WHERE barcode=?")
    .get(String(req.params.barcode)) as any;
  if (!row)
    return res
      .status(404)
      .json({ error: "Unknown barcode", barcode: req.params.barcode });
  if (req.user!.role !== "administrator" && row.venue_id !== req.user!.venueId)
    return res.status(403).json({ error: "Venue access denied" });
  res.json(row);
});
app.get("/api/assets/:id/pat-tests", (req, res) =>
  res.json(
    rows(
      "SELECT * FROM pat_tests WHERE asset_id=? ORDER BY test_date DESC",
      Number(req.params.id),
    ),
  ),
);
app.post("/api/assets/:id/pat-tests", canWrite, (req: AuthedRequest, res) => {
  const asset = db
    .prepare("SELECT * FROM assets WHERE id=?")
    .get(Number(req.params.id)) as any;
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (
    req.user!.role !== "administrator" &&
    asset.venue_id !== req.user!.venueId
  )
    return res.status(403).json({ error: "Venue access denied" });
  const p = z
    .object({
      result: z.enum(["Pass", "Fail"]),
      test_date: z.string().min(8),
      next_date: z.string().optional(),
      visual_result: z.string().optional(),
      tester: z.string().optional(),
      readings: z.string().optional(),
      notes: z.string().optional(),
      action_required: z.string().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid PAT test" });
  const c = Object.keys(p.data),
    r = db
      .prepare(
        `INSERT INTO pat_tests(asset_id,${c.join(",")},created_by) VALUES(?,${c.map(() => "?").join(",")},?)`,
      )
      .run(asset.id, ...Object.values(p.data), req.user!.id);
  const id = Number(r.lastInsertRowid),
    after = db.prepare("SELECT * FROM pat_tests WHERE id=?").get(id);
  audit("pat_tests", id, "create", null, after, req.user!.id, req.ip);
  res.status(201).json(after);
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_r, f, cb) =>
    cb(
      null,
      ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
        f.mimetype,
      ),
    ),
});
app.post(
  "/api/uploads",
  canWrite,
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file)
      return res.status(400).json({ error: "PDF or image required" });
    const key = await storage.put(req.file.buffer, req.file.originalname);
    audit(
      "upload",
      null,
      "create",
      null,
      { key, mime: req.file.mimetype },
      req.user!.id,
      req.ip,
    );
    res.status(201).json({ storage_key: key, mime_type: req.file.mimetype });
  },
);
app.get(/^\/files\/(.+)$/, authenticate, (req, res) => {
  try {
    storage.stream(String(req.params[0])).pipe(res);
  } catch {
    res.status(404).end();
  }
});
app.get("/api/audit", allow("administrator", "auditor"), (_q, res) =>
  res.json(
    rows(
      "SELECT a.*,u.name user_name FROM audit_events a LEFT JOIN users u ON u.id=a.user_id ORDER BY occurred_at DESC LIMIT 500",
    ),
  ),
);
app.get("/api/users", canAdmin, (_q, res) =>
  res.json(
    rows("SELECT id,email,name,role,venue_id,active,created_at FROM users"),
  ),
);
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});
const port = Number(process.env.PORT || 4100);
if (process.env.NODE_ENV !== "test")
  app.listen(port, () =>
    console.log(`Compliance API on http://localhost:${port}`),
  );
export default app;
