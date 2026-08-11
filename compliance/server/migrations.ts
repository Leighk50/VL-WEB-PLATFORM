export type Migration = {
  version: number;
  name: string;
  sqlite: string;
  azure: string | readonly string[];
};

export function sqlBatches(migration: Migration, provider: "sqlite" | "azure-sql") {
  const sql = provider === "sqlite" ? migration.sqlite : migration.azure;
  return Array.isArray(sql) ? [...sql] : [sql as string];
}

export async function executeMigrationBatches(
  migration: Migration,
  provider: "sqlite" | "azure-sql",
  execute: (statement: string) => Promise<unknown>,
) {
  for (const statement of sqlBatches(migration, provider)) await execute(statement);
}

export async function executeAndMarkMigration(
  migration: Migration,
  provider: "sqlite" | "azure-sql",
  execute: (statement: string) => Promise<unknown>,
  markApplied: () => Promise<unknown>,
) {
  await executeMigrationBatches(migration, provider, execute);
  await markApplied();
}
const sqlite = `
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
CREATE INDEX IF NOT EXISTS idx_pat_asset ON pat_tests(asset_id); CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status); CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type,entity_id);`;

const azure = `
IF OBJECT_ID('venues','U') IS NULL CREATE TABLE venues(id BIGINT IDENTITY PRIMARY KEY,name NVARCHAR(250) NOT NULL,is_demo BIT NOT NULL DEFAULT 0,created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID('locations','U') IS NULL CREATE TABLE locations(id BIGINT IDENTITY PRIMARY KEY,venue_id BIGINT NOT NULL REFERENCES venues(id),name NVARCHAR(250) NOT NULL,active BIT NOT NULL DEFAULT 1,CONSTRAINT uq_locations_venue_name UNIQUE(venue_id,name));
IF OBJECT_ID('users','U') IS NULL CREATE TABLE users(id BIGINT IDENTITY PRIMARY KEY,email NVARCHAR(254) NOT NULL UNIQUE,password_hash NVARCHAR(255) NOT NULL,name NVARCHAR(250) NOT NULL,role NVARCHAR(40) NOT NULL,venue_id BIGINT NULL REFERENCES venues(id),active BIT NOT NULL DEFAULT 1,created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
IF OBJECT_ID('assets','U') IS NULL CREATE TABLE assets(id BIGINT IDENTITY PRIMARY KEY,barcode NVARCHAR(250) NOT NULL UNIQUE,description NVARCHAR(500) NOT NULL,category NVARCHAR(250),manufacturer NVARCHAR(250),model NVARCHAR(250),serial_number NVARCHAR(250),venue_id BIGINT NOT NULL REFERENCES venues(id),location_id BIGINT REFERENCES locations(id),purchase_date DATE,status NVARCHAR(40) DEFAULT 'Active',notes NVARCHAR(MAX),pat_status NVARCHAR(40) DEFAULT 'Assessment Required',main_photo_id BIGINT,created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT,is_demo BIT DEFAULT 0);
IF OBJECT_ID('pat_tests','U') IS NULL CREATE TABLE pat_tests(id BIGINT IDENTITY PRIMARY KEY,asset_id BIGINT NOT NULL REFERENCES assets(id),visual_result NVARCHAR(500),result NVARCHAR(20) NOT NULL,test_date DATE NOT NULL,next_date DATE,tester NVARCHAR(500),readings NVARCHAR(MAX),notes NVARCHAR(MAX),document_id BIGINT,action_required NVARCHAR(MAX),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT);
IF OBJECT_ID('extinguishers','U') IS NULL CREATE TABLE extinguishers(id BIGINT IDENTITY PRIMARY KEY,barcode NVARCHAR(250) NOT NULL UNIQUE,type NVARCHAR(40) NOT NULL,capacity NVARCHAR(100),manufacturer NVARCHAR(250),model NVARCHAR(250),serial_number NVARCHAR(250),venue_id BIGINT NOT NULL REFERENCES venues(id),location_id BIGINT REFERENCES locations(id),manufacture_date DATE,commissioned_date DATE,status NVARCHAR(40) DEFAULT 'In Service',last_service_date DATE,next_service_date DATE,pressure_condition NVARCHAR(500),pin_seal_ok BIT,hose_ok BIT,signage_present BIT,positioned_ok BIT,accessible BIT,damage_corrosion NVARCHAR(MAX),contractor NVARCHAR(500),document_id BIGINT,notes NVARCHAR(MAX),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT,is_demo BIT DEFAULT 0);
IF OBJECT_ID('extinguisher_checks','U') IS NULL CREATE TABLE extinguisher_checks(id BIGINT IDENTITY PRIMARY KEY,extinguisher_id BIGINT NOT NULL REFERENCES extinguishers(id),check_date DATE NOT NULL,result NVARCHAR(20) NOT NULL,pressure_condition NVARCHAR(500),pin_seal_ok BIT,hose_ok BIT,signage_present BIT,positioned_ok BIT,accessible BIT,damage_corrosion NVARCHAR(MAX),notes NVARCHAR(MAX),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT);
IF OBJECT_ID('fire_alarm_tests','U') IS NULL CREATE TABLE fire_alarm_tests(id BIGINT IDENTITY PRIMARY KEY,venue_id BIGINT NOT NULL REFERENCES venues(id),test_datetime DATETIME2 NOT NULL,call_point NVARCHAR(500),zone NVARCHAR(250),sounder_result NVARCHAR(500),equipment_result NVARCHAR(500),result NVARCHAR(20) NOT NULL,faults NVARCHAR(MAX),completed_by NVARCHAR(500),confirmed BIT DEFAULT 0,notes NVARCHAR(MAX),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,is_demo BIT DEFAULT 0);
IF OBJECT_ID('fire_alarm_services','U') IS NULL CREATE TABLE fire_alarm_services(id BIGINT IDENTITY PRIMARY KEY,venue_id BIGINT NOT NULL REFERENCES venues(id),contractor NVARCHAR(500),service_date DATE NOT NULL,next_service_date DATE,interval_months INT,document_id BIGINT,defects NVARCHAR(MAX),remedial_actions NVARCHAR(MAX),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT);
IF OBJECT_ID('risk_assessments','U') IS NULL CREATE TABLE risk_assessments(id BIGINT IDENTITY PRIMARY KEY,venue_id BIGINT NOT NULL REFERENCES venues(id),assessment_date DATE NOT NULL,assessor NVARCHAR(500),review_date DATE,document_id BIGINT,hazards NVARCHAR(MAX),people_at_risk NVARCHAR(MAX),escape_routes NVARCHAR(MAX),detection_warning NVARCHAR(MAX),doors_compartmentation NVARCHAR(MAX),emergency_lighting NVARCHAR(MAX),extinguishers NVARCHAR(MAX),training NVARCHAR(MAX),evacuation NVARCHAR(MAX),notes NVARCHAR(MAX),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT);
IF OBJECT_ID('furnishings','U') IS NULL CREATE TABLE furnishings(id BIGINT IDENTITY PRIMARY KEY,description NVARCHAR(500) NOT NULL,quantity INT DEFAULT 1,category NVARCHAR(80),venue_id BIGINT NOT NULL REFERENCES venues(id),location_id BIGINT REFERENCES locations(id),supplier NVARCHAR(500),purchase_date DATE,fire_status NVARCHAR(80) NOT NULL,treatment_product NVARCHAR(500),treatment_date DATE,treatment_provider NVARCHAR(500),batch_reference NVARCHAR(250),document_id BIGINT,next_review_date DATE,notes NVARCHAR(MAX),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT,is_demo BIT DEFAULT 0);
IF OBJECT_ID('documents','U') IS NULL CREATE TABLE documents(id BIGINT IDENTITY PRIMARY KEY,venue_id BIGINT NOT NULL REFERENCES venues(id),type NVARCHAR(100) NOT NULL,title NVARCHAR(500) NOT NULL,reference NVARCHAR(250),issue_date DATE,review_date DATE,issuer NVARCHAR(500),notes NVARCHAR(MAX),storage_key NVARCHAR(1000),mime_type NVARCHAR(150),version INT DEFAULT 1,previous_version_id BIGINT REFERENCES documents(id),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,is_demo BIT DEFAULT 0);
IF OBJECT_ID('document_links','U') IS NULL CREATE TABLE document_links(id BIGINT IDENTITY PRIMARY KEY,document_id BIGINT NOT NULL REFERENCES documents(id),entity_type NVARCHAR(80) NOT NULL,entity_id BIGINT NOT NULL,CONSTRAINT uq_document_links UNIQUE(document_id,entity_type,entity_id));
IF OBJECT_ID('photos','U') IS NULL CREATE TABLE photos(id BIGINT IDENTITY PRIMARY KEY,entity_type NVARCHAR(80) NOT NULL,entity_id BIGINT NOT NULL,storage_key NVARCHAR(1000) NOT NULL,mime_type NVARCHAR(150),captured_at DATETIME2,caption NVARCHAR(500),is_main BIT DEFAULT 0,created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT);
IF OBJECT_ID('actions','U') IS NULL CREATE TABLE actions(id BIGINT IDENTITY PRIMARY KEY,description NVARCHAR(500) NOT NULL,venue_id BIGINT NOT NULL REFERENCES venues(id),location_id BIGINT REFERENCES locations(id),related_type NVARCHAR(80),related_id BIGINT,priority NVARCHAR(20) DEFAULT 'Medium',responsible_person NVARCHAR(500),created_date DATE DEFAULT CAST(GETUTCDATE() AS DATE),due_date DATE,status NVARCHAR(40) DEFAULT 'Open',completion_notes NVARCHAR(MAX),completion_document_id BIGINT,closed_date DATE,created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT,is_demo BIT DEFAULT 0);
IF OBJECT_ID('audit_events','U') IS NULL CREATE TABLE audit_events(id BIGINT IDENTITY PRIMARY KEY,entity_type NVARCHAR(80) NOT NULL,entity_id BIGINT,action NVARCHAR(80) NOT NULL,before_json NVARCHAR(MAX),after_json NVARCHAR(MAX),user_id BIGINT,occurred_at DATETIME2 DEFAULT SYSUTCDATETIME(),ip_address NVARCHAR(100));
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='idx_pat_asset') CREATE INDEX idx_pat_asset ON pat_tests(asset_id);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='idx_actions_status') CREATE INDEX idx_actions_status ON actions(status);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='idx_audit_entity') CREATE INDEX idx_audit_entity ON audit_events(entity_type,entity_id);`;

export const migrations: Migration[] = [
  { version: 1, name: "initial_compliance_schema", sqlite, azure },
  {
    version: 2,
    name: "document_evidence_and_fire_alarm_call_points",
    sqlite: `
ALTER TABLE documents ADD COLUMN location_id INTEGER REFERENCES locations(id);
ALTER TABLE documents ADD COLUMN updated_at TEXT;
ALTER TABLE documents ADD COLUMN updated_by INTEGER;
CREATE TABLE document_attachments(id INTEGER PRIMARY KEY,document_id INTEGER NOT NULL REFERENCES documents(id),storage_key TEXT NOT NULL,original_name TEXT NOT NULL,mime_type TEXT NOT NULL,file_size INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER NOT NULL REFERENCES users(id));
CREATE INDEX idx_document_attachments_document ON document_attachments(document_id);
CREATE TABLE fire_alarm_call_points(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL REFERENCES venues(id),code TEXT NOT NULL,description TEXT NOT NULL,location_id INTEGER NOT NULL REFERENCES locations(id),panel_zone TEXT,active INTEGER NOT NULL DEFAULT 1,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER,UNIQUE(venue_id,code));
CREATE INDEX idx_call_points_venue_active ON fire_alarm_call_points(venue_id,active);
ALTER TABLE fire_alarm_tests ADD COLUMN call_point_id INTEGER REFERENCES fire_alarm_call_points(id);
ALTER TABLE fire_alarm_tests ADD COLUMN alarm_operated INTEGER;
ALTER TABLE fire_alarm_tests ADD COLUMN sounders_activated INTEGER;
ALTER TABLE fire_alarm_tests ADD COLUMN panel_indication_correct INTEGER;
ALTER TABLE fire_alarm_tests ADD COLUMN reset_successful INTEGER;
ALTER TABLE fire_alarm_tests ADD COLUMN action_id INTEGER REFERENCES actions(id);
CREATE TABLE document_types(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL REFERENCES venues(id),name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER,UNIQUE(venue_id,name));
CREATE TABLE venue_settings(venue_id INTEGER PRIMARY KEY REFERENCES venues(id),call_point_warning_days INTEGER NOT NULL DEFAULT 28,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER);`,
    azure: `
IF COL_LENGTH('documents','location_id') IS NULL ALTER TABLE documents ADD location_id BIGINT NULL REFERENCES locations(id);
IF COL_LENGTH('documents','updated_at') IS NULL ALTER TABLE documents ADD updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME();
IF COL_LENGTH('documents','updated_by') IS NULL ALTER TABLE documents ADD updated_by BIGINT NULL;
IF OBJECT_ID('document_attachments','U') IS NULL CREATE TABLE document_attachments(id BIGINT IDENTITY PRIMARY KEY,document_id BIGINT NOT NULL REFERENCES documents(id),storage_key NVARCHAR(1000) NOT NULL,original_name NVARCHAR(500) NOT NULL,mime_type NVARCHAR(150) NOT NULL,file_size BIGINT NOT NULL,created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),created_by BIGINT NOT NULL REFERENCES users(id));
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='idx_document_attachments_document') CREATE INDEX idx_document_attachments_document ON document_attachments(document_id);
IF OBJECT_ID('fire_alarm_call_points','U') IS NULL CREATE TABLE fire_alarm_call_points(id BIGINT IDENTITY PRIMARY KEY,venue_id BIGINT NOT NULL REFERENCES venues(id),code NVARCHAR(100) NOT NULL,description NVARCHAR(500) NOT NULL,location_id BIGINT NOT NULL REFERENCES locations(id),panel_zone NVARCHAR(250),active BIT NOT NULL DEFAULT 1,notes NVARCHAR(MAX),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT,CONSTRAINT uq_call_points_venue_code UNIQUE(venue_id,code));
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='idx_call_points_venue_active') CREATE INDEX idx_call_points_venue_active ON fire_alarm_call_points(venue_id,active);
IF COL_LENGTH('fire_alarm_tests','call_point_id') IS NULL ALTER TABLE fire_alarm_tests ADD call_point_id BIGINT NULL REFERENCES fire_alarm_call_points(id);
IF COL_LENGTH('fire_alarm_tests','alarm_operated') IS NULL ALTER TABLE fire_alarm_tests ADD alarm_operated BIT NULL;
IF COL_LENGTH('fire_alarm_tests','sounders_activated') IS NULL ALTER TABLE fire_alarm_tests ADD sounders_activated BIT NULL;
IF COL_LENGTH('fire_alarm_tests','panel_indication_correct') IS NULL ALTER TABLE fire_alarm_tests ADD panel_indication_correct BIT NULL;
IF COL_LENGTH('fire_alarm_tests','reset_successful') IS NULL ALTER TABLE fire_alarm_tests ADD reset_successful BIT NULL;
IF COL_LENGTH('fire_alarm_tests','action_id') IS NULL ALTER TABLE fire_alarm_tests ADD action_id BIGINT NULL REFERENCES actions(id);
IF OBJECT_ID('document_types','U') IS NULL CREATE TABLE document_types(id BIGINT IDENTITY PRIMARY KEY,venue_id BIGINT NOT NULL REFERENCES venues(id),name NVARCHAR(250) NOT NULL,active BIT NOT NULL DEFAULT 1,created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT,CONSTRAINT uq_document_types_venue_name UNIQUE(venue_id,name));
IF OBJECT_ID('venue_settings','U') IS NULL CREATE TABLE venue_settings(venue_id BIGINT PRIMARY KEY REFERENCES venues(id),call_point_warning_days INT NOT NULL DEFAULT 28,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT);`,
  },
  {
    version: 3,
    name: "versioned_risk_assessment_library",
    sqlite: `
ALTER TABLE risk_assessments ADD COLUMN title TEXT;
ALTER TABLE risk_assessments ADD COLUMN category TEXT;
ALTER TABLE risk_assessments ADD COLUMN area TEXT;
ALTER TABLE risk_assessments ADD COLUMN location_id INTEGER REFERENCES locations(id);
ALTER TABLE risk_assessments ADD COLUMN responsible_person TEXT;
ALTER TABLE risk_assessments ADD COLUMN status TEXT NOT NULL DEFAULT 'Draft';
ALTER TABLE risk_assessments ADD COLUMN overall_risk_rating TEXT;
ALTER TABLE risk_assessments ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE risk_assessments ADD COLUMN previous_version_id INTEGER REFERENCES risk_assessments(id);
ALTER TABLE risk_assessments ADD COLUMN template_key TEXT;
ALTER TABLE risk_assessments ADD COLUMN site_verification_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE risk_assessments ADD COLUMN signed_by TEXT;
ALTER TABLE risk_assessments ADD COLUMN signed_at TEXT;
ALTER TABLE risk_assessments ADD COLUMN signoff_notes TEXT;
ALTER TABLE risk_assessments ADD COLUMN archived_at TEXT;
CREATE TABLE risk_hazards(id INTEGER PRIMARY KEY,assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id),hazard TEXT NOT NULL,who_may_be_harmed TEXT NOT NULL,how_harmed TEXT NOT NULL,existing_controls TEXT NOT NULL,initial_likelihood INTEGER NOT NULL,initial_severity INTEGER NOT NULL,initial_score INTEGER NOT NULL,further_action TEXT,responsible_person TEXT,target_date TEXT,residual_likelihood INTEGER NOT NULL,residual_severity INTEGER NOT NULL,residual_score INTEGER NOT NULL,status TEXT NOT NULL,completion_document_id INTEGER REFERENCES documents(id),site_verification_required INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_by INTEGER);
CREATE INDEX idx_risk_hazards_assessment ON risk_hazards(assessment_id);
CREATE TABLE risk_assessment_history(id INTEGER PRIMARY KEY,assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id),version INTEGER NOT NULL,snapshot_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER);
CREATE INDEX idx_risk_history_assessment ON risk_assessment_history(assessment_id,version);
CREATE TABLE risk_template_registry(venue_id INTEGER NOT NULL REFERENCES venues(id),template_key TEXT NOT NULL,assessment_id INTEGER REFERENCES risk_assessments(id),created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(venue_id,template_key));
CREATE UNIQUE INDEX uq_risk_template_assessment ON risk_assessments(venue_id,template_key) WHERE template_key IS NOT NULL;`,
    azure: [`
IF COL_LENGTH('risk_assessments','title') IS NULL ALTER TABLE risk_assessments ADD title NVARCHAR(500) NULL;
IF COL_LENGTH('risk_assessments','category') IS NULL ALTER TABLE risk_assessments ADD category NVARCHAR(100) NULL;
IF COL_LENGTH('risk_assessments','area') IS NULL ALTER TABLE risk_assessments ADD area NVARCHAR(100) NULL;
IF COL_LENGTH('risk_assessments','location_id') IS NULL ALTER TABLE risk_assessments ADD location_id BIGINT NULL REFERENCES locations(id);
IF COL_LENGTH('risk_assessments','responsible_person') IS NULL ALTER TABLE risk_assessments ADD responsible_person NVARCHAR(500) NULL;
IF COL_LENGTH('risk_assessments','status') IS NULL ALTER TABLE risk_assessments ADD status NVARCHAR(40) NOT NULL CONSTRAINT df_risk_status DEFAULT 'Draft';
IF COL_LENGTH('risk_assessments','overall_risk_rating') IS NULL ALTER TABLE risk_assessments ADD overall_risk_rating NVARCHAR(80) NULL;
IF COL_LENGTH('risk_assessments','version') IS NULL ALTER TABLE risk_assessments ADD version INT NOT NULL CONSTRAINT df_risk_version DEFAULT 1;
IF COL_LENGTH('risk_assessments','previous_version_id') IS NULL ALTER TABLE risk_assessments ADD previous_version_id BIGINT NULL REFERENCES risk_assessments(id);
IF COL_LENGTH('risk_assessments','template_key') IS NULL ALTER TABLE risk_assessments ADD template_key NVARCHAR(150) NULL;
IF COL_LENGTH('risk_assessments','site_verification_required') IS NULL ALTER TABLE risk_assessments ADD site_verification_required BIT NOT NULL CONSTRAINT df_risk_verify DEFAULT 0;
IF COL_LENGTH('risk_assessments','signed_by') IS NULL ALTER TABLE risk_assessments ADD signed_by NVARCHAR(500) NULL;
IF COL_LENGTH('risk_assessments','signed_at') IS NULL ALTER TABLE risk_assessments ADD signed_at DATETIME2 NULL;
IF COL_LENGTH('risk_assessments','signoff_notes') IS NULL ALTER TABLE risk_assessments ADD signoff_notes NVARCHAR(MAX) NULL;
IF COL_LENGTH('risk_assessments','archived_at') IS NULL ALTER TABLE risk_assessments ADD archived_at DATETIME2 NULL;
IF OBJECT_ID('risk_hazards','U') IS NULL CREATE TABLE risk_hazards(id BIGINT IDENTITY PRIMARY KEY,assessment_id BIGINT NOT NULL REFERENCES risk_assessments(id),hazard NVARCHAR(500) NOT NULL,who_may_be_harmed NVARCHAR(MAX) NOT NULL,how_harmed NVARCHAR(MAX) NOT NULL,existing_controls NVARCHAR(MAX) NOT NULL,initial_likelihood INT NOT NULL,initial_severity INT NOT NULL,initial_score INT NOT NULL,further_action NVARCHAR(MAX),responsible_person NVARCHAR(500),target_date DATE,residual_likelihood INT NOT NULL,residual_severity INT NOT NULL,residual_score INT NOT NULL,status NVARCHAR(50) NOT NULL,completion_document_id BIGINT NULL REFERENCES documents(id),site_verification_required BIT NOT NULL DEFAULT 0,created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT,updated_at DATETIME2 DEFAULT SYSUTCDATETIME(),updated_by BIGINT);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='idx_risk_hazards_assessment') CREATE INDEX idx_risk_hazards_assessment ON risk_hazards(assessment_id);
IF OBJECT_ID('risk_assessment_history','U') IS NULL CREATE TABLE risk_assessment_history(id BIGINT IDENTITY PRIMARY KEY,assessment_id BIGINT NOT NULL REFERENCES risk_assessments(id),version INT NOT NULL,snapshot_json NVARCHAR(MAX) NOT NULL,reason NVARCHAR(500) NOT NULL,created_at DATETIME2 DEFAULT SYSUTCDATETIME(),created_by BIGINT);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='idx_risk_history_assessment') CREATE INDEX idx_risk_history_assessment ON risk_assessment_history(assessment_id,version);
IF OBJECT_ID('risk_template_registry','U') IS NULL CREATE TABLE risk_template_registry(venue_id BIGINT NOT NULL REFERENCES venues(id),template_key NVARCHAR(150) NOT NULL,assessment_id BIGINT NULL REFERENCES risk_assessments(id),created_at DATETIME2 DEFAULT SYSUTCDATETIME(),CONSTRAINT pk_risk_template_registry PRIMARY KEY(venue_id,template_key));`,
      `IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='uq_risk_template_assessment' AND object_id=OBJECT_ID('risk_assessments')) CREATE UNIQUE INDEX uq_risk_template_assessment ON risk_assessments(venue_id,template_key) WHERE template_key IS NOT NULL;`,
    ],
  },
];
