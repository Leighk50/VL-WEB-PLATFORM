import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import bcrypt from "bcryptjs";

const path = resolve(process.env.SQLITE_PATH || ".data/compliance.db");
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
export function migrate() {
  db.exec(`
CREATE TABLE IF NOT EXISTS venues(id INTEGER PRIMARY KEY,name TEXT NOT NULL,is_demo INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS locations(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL REFERENCES venues(id),name TEXT NOT NULL,active INTEGER DEFAULT 1,UNIQUE(venue_id,name));
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,venue_id INTEGER REFERENCES venues(id),active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS assets(id INTEGER PRIMARY KEY,barcode TEXT UNIQUE NOT NULL,description TEXT NOT NULL,category TEXT,manufacturer TEXT,model TEXT,serial_number TEXT,venue_id INTEGER NOT NULL REFERENCES venues(id),location_id INTEGER REFERENCES locations(id),purchase_date TEXT,status TEXT DEFAULT 'Active',notes TEXT,pat_status TEXT DEFAULT 'Assessment Required',main_photo_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER,is_demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS pat_tests(id INTEGER PRIMARY KEY,asset_id INTEGER NOT NULL REFERENCES assets(id),visual_result TEXT,result TEXT NOT NULL,test_date TEXT NOT NULL,next_date TEXT,tester TEXT,readings TEXT,notes TEXT,document_id INTEGER,action_required TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER);
CREATE TABLE IF NOT EXISTS extinguishers(id INTEGER PRIMARY KEY,barcode TEXT UNIQUE NOT NULL,type TEXT NOT NULL,capacity TEXT,manufacturer TEXT,model TEXT,serial_number TEXT,venue_id INTEGER NOT NULL REFERENCES venues(id),location_id INTEGER REFERENCES locations(id),manufacture_date TEXT,commissioned_date TEXT,status TEXT DEFAULT 'In Service',last_service_date TEXT,next_service_date TEXT,pressure_condition TEXT,pin_seal_ok INTEGER,hose_ok INTEGER,signage_present INTEGER,positioned_ok INTEGER,accessible INTEGER,damage_corrosion TEXT,contractor TEXT,document_id INTEGER,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER,is_demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS extinguisher_checks(id INTEGER PRIMARY KEY,extinguisher_id INTEGER NOT NULL REFERENCES extinguishers(id),check_date TEXT NOT NULL,result TEXT NOT NULL,pressure_condition TEXT,pin_seal_ok INTEGER,hose_ok INTEGER,signage_present INTEGER,positioned_ok INTEGER,accessible INTEGER,damage_corrosion TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER);
CREATE TABLE IF NOT EXISTS fire_alarm_tests(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL REFERENCES venues(id),test_datetime TEXT NOT NULL,call_point TEXT,zone TEXT,sounder_result TEXT,equipment_result TEXT,result TEXT NOT NULL,faults TEXT,completed_by TEXT,confirmed INTEGER DEFAULT 0,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,is_demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS fire_alarm_services(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL REFERENCES venues(id),contractor TEXT,service_date TEXT NOT NULL,next_service_date TEXT,interval_months INTEGER,document_id INTEGER,defects TEXT,remedial_actions TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER);
CREATE TABLE IF NOT EXISTS risk_assessments(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL REFERENCES venues(id),assessment_date TEXT NOT NULL,assessor TEXT,review_date TEXT,document_id INTEGER,hazards TEXT,people_at_risk TEXT,escape_routes TEXT,detection_warning TEXT,doors_compartmentation TEXT,emergency_lighting TEXT,extinguishers TEXT,training TEXT,evacuation TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER);
CREATE TABLE IF NOT EXISTS furnishings(id INTEGER PRIMARY KEY,description TEXT NOT NULL,quantity INTEGER DEFAULT 1,category TEXT,venue_id INTEGER NOT NULL REFERENCES venues(id),location_id INTEGER REFERENCES locations(id),supplier TEXT,purchase_date TEXT,fire_status TEXT NOT NULL,treatment_product TEXT,treatment_date TEXT,treatment_provider TEXT,batch_reference TEXT,document_id INTEGER,next_review_date TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER,is_demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL REFERENCES venues(id),type TEXT NOT NULL,title TEXT NOT NULL,reference TEXT,issue_date TEXT,review_date TEXT,issuer TEXT,notes TEXT,storage_key TEXT,mime_type TEXT,version INTEGER DEFAULT 1,previous_version_id INTEGER REFERENCES documents(id),created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,is_demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS document_links(id INTEGER PRIMARY KEY,document_id INTEGER NOT NULL REFERENCES documents(id),entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,UNIQUE(document_id,entity_type,entity_id));
CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY,entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,storage_key TEXT NOT NULL,mime_type TEXT,captured_at TEXT,caption TEXT,is_main INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER);
CREATE TABLE IF NOT EXISTS actions(id INTEGER PRIMARY KEY,description TEXT NOT NULL,venue_id INTEGER NOT NULL REFERENCES venues(id),location_id INTEGER REFERENCES locations(id),related_type TEXT,related_id INTEGER,priority TEXT DEFAULT 'Medium',responsible_person TEXT,created_date TEXT DEFAULT CURRENT_DATE,due_date TEXT,status TEXT DEFAULT 'Open',completion_notes TEXT,completion_document_id INTEGER,closed_date TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER,is_demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY,entity_type TEXT NOT NULL,entity_id INTEGER,action TEXT NOT NULL,before_json TEXT,after_json TEXT,user_id INTEGER,occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,ip_address TEXT);
CREATE INDEX IF NOT EXISTS idx_pat_asset ON pat_tests(asset_id); CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status); CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type,entity_id);
`);
  seed();
}
function seed() {
  if (!process.env.DEMO_SEED || process.env.DEMO_SEED === "false") return;
  let venue = db.prepare("SELECT id FROM venues LIMIT 1").get() as
    { id: number } | undefined;
  if (!venue) {
    db.prepare("INSERT INTO venues(name,is_demo) VALUES(?,1)").run(
      "Village Limits (DEMO)",
    );
    venue = {
      id: Number(db.prepare("SELECT last_insert_rowid() id").get()!.id),
    };
    for (const n of [
      "Bar",
      "Restaurant",
      "Main Kitchen",
      "Cellar",
      "Reception",
      "Breakfast Room",
      "Bedroom 1",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "Bedroom 5",
      "Bedroom 6",
      "Laundry",
      "Office",
      "Outside",
      "Plant Room",
    ])
      db.prepare("INSERT INTO locations(venue_id,name) VALUES(?,?)").run(
        venue.id,
        n,
      );
  }
  if (!db.prepare("SELECT id FROM users LIMIT 1").get()) {
    db.prepare(
      "INSERT INTO users(email,password_hash,name,role,venue_id) VALUES(?,?,?,?,?)",
    ).run(
      "admin@demo.local",
      bcrypt.hashSync("ChangeMe!123", 12),
      "Demo Administrator",
      "administrator",
      venue.id,
    );
  }
  if (!db.prepare("SELECT id FROM assets LIMIT 1").get()) {
    const loc = db
      .prepare("SELECT id FROM locations WHERE venue_id=? AND name=?")
      .get(venue.id, "Main Kitchen") as { id: number };
    db.prepare(
      "INSERT INTO assets(barcode,description,category,venue_id,location_id,pat_status,is_demo) VALUES(?,?,?,?,?,?,1)",
    ).run(
      "VL-DEMO-001",
      "Demo commercial toaster",
      "Kitchen Equipment",
      venue.id,
      loc.id,
      "PAT Required",
    );
  }
}
export function rows(sql: string, ...params: any[]) {
  return db.prepare(sql).all(...params);
}
export function audit(
  entityType: string,
  entityId: number | null,
  action: string,
  before: unknown,
  after: unknown,
  userId?: number,
  ip?: string,
) {
  db.prepare(
    "INSERT INTO audit_events(entity_type,entity_id,action,before_json,after_json,user_id,ip_address) VALUES(?,?,?,?,?,?,?)",
  ).run(
    entityType,
    entityId,
    action,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    userId || null,
    ip || null,
  );
}
