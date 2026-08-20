import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { executeAndMarkMigration, migrations, sqlBatches } from "./migrations.js";

describe("Azure SQL migration batching", () => {
  const migration = migrations.find((item) => item.version === 3)!;

  it("adds template_key in an earlier request than the index that references it", () => {
    const batches = sqlBatches(migration, "azure-sql");
    expect(batches).toHaveLength(2);
    expect(batches[0]).toContain("ALTER TABLE risk_assessments ADD template_key");
    expect(batches[0]).not.toContain("CREATE UNIQUE INDEX uq_risk_template_assessment");
    expect(batches[1]).toContain("CREATE UNIQUE INDEX uq_risk_template_assessment");
    expect(batches.join("\n")).not.toMatch(/^\s*GO\s*$/im);
  });

  it("guards every partial-run-sensitive Azure schema operation", () => {
    const sql = sqlBatches(migration, "azure-sql").join("\n");
    expect(sql).toContain("COL_LENGTH('risk_assessments','template_key') IS NULL");
    expect(sql).toContain("OBJECT_ID('risk_hazards','U') IS NULL");
    expect(sql).toContain("OBJECT_ID('risk_assessment_history','U') IS NULL");
    expect(sql).toContain("OBJECT_ID('risk_template_registry','U') IS NULL");
    expect(sql).toContain("name='uq_risk_template_assessment'");
  });

  it("does not mark migration 3 applied when a later SQL request fails", async () => {
    const requests: string[] = [];
    const markApplied = vi.fn(async () => undefined);
    await expect(executeAndMarkMigration(migration, "azure-sql", async statement => {
      requests.push(statement);
      if (requests.length === 2) throw new Error("simulated SQL compilation failure");
    }, markApplied)).rejects.toThrow("simulated SQL compilation failure");
    expect(requests).toHaveLength(2);
    expect(markApplied).not.toHaveBeenCalled();
  });

  it("leaves migration 1 and 2 operational data intact", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys=ON");
    database.exec(migrations[0].sqlite);
    database.exec(migrations[1].sqlite);
    database.exec(`
      INSERT INTO venues(id,name,is_demo) VALUES(1,'Village Limits',0);
      INSERT INTO locations(id,venue_id,name) VALUES(1,1,'Restaurant');
      INSERT INTO users(id,email,password_hash,name,role,venue_id) VALUES(1,'admin@example.test','hash','Administrator','administrator',1);
      INSERT INTO documents(id,venue_id,type,title,created_by) VALUES(1,1,'Certificate','Existing certificate',1);
      INSERT INTO document_attachments(id,document_id,storage_key,original_name,mime_type,file_size,created_by) VALUES(1,1,'2026/existing.pdf','existing.pdf','application/pdf',10,1);
      INSERT INTO fire_alarm_call_points(id,venue_id,code,description,location_id,created_by) VALUES(1,1,'CP01','Existing call point',1,1);
      INSERT INTO fire_alarm_tests(id,venue_id,test_datetime,result,call_point_id,created_by) VALUES(1,1,'2026-08-01T09:00','Pass',1,1);
    `);
    await executeAndMarkMigration(migration, "sqlite", async statement => database.exec(statement), async () => undefined);
    for (const table of ["venues", "locations", "users", "documents", "document_attachments", "fire_alarm_call_points", "fire_alarm_tests"])
      expect(Number((database.prepare(`SELECT count(*) count FROM ${table}`).get() as any).count), table).toBe(1);
    expect((database.prepare("SELECT title FROM documents WHERE id=1").get() as any).title).toBe("Existing certificate");
    expect((database.prepare("SELECT description FROM fire_alarm_call_points WHERE id=1").get() as any).description).toBe("Existing call point");
    database.close();
  });

  it("adds a provider-compatible venue asset reference sequence", () => {
    const migration = migrations.find((item) => item.version === 6)!;
    expect(migration.sqlite).toContain("asset_reference_sequences");
    expect(migration.azure).toContain("OBJECT_ID('asset_reference_sequences','U') IS NULL");
  });

  it("guards Azure content-review tracking columns for safe deployment", () => {
    const migration = migrations.find((item) => item.version === 7)!;
    const sql = sqlBatches(migration, "azure-sql").join("\n");
    expect(sql).toContain("COL_LENGTH('risk_assessments','content_reviewed_at') IS NULL");
    expect(sql).toContain("COL_LENGTH('risk_assessments','content_review_note') IS NULL");
  });

  it("adds module_access before referencing it in migration 9", () => {
    const migration = migrations.find((item) => item.version === 9)!;
    const batches = sqlBatches(migration, "azure-sql");
    expect(batches).toHaveLength(5);
    expect(batches[0]).toContain("ALTER TABLE users ADD module_access");
    expect(batches[0]).not.toContain("UPDATE users SET module_access");
    expect(batches[2]).toContain("UPDATE users SET module_access='both'");
    expect(batches.join("\n")).not.toMatch(/^\s*GO\s*$/im);
  });

  it("does not mark migration 9 complete when a later request fails", async () => {
    const migration = migrations.find((item) => item.version === 9)!;
    const markApplied = vi.fn(async () => undefined);
    await expect(executeAndMarkMigration(migration,"azure-sql",async statement=>{
      if(statement.includes("UPDATE users SET module_access"))throw new Error("simulated migration 9 failure");
    },markApplied)).rejects.toThrow("simulated migration 9 failure");
    expect(markApplied).not.toHaveBeenCalled();
  });

  it("safely reruns migration 9 after a partially attempted Azure execution", async () => {
    const migration = migrations.find((item) => item.version === 9)!;
    const state = { moduleAccess: false, lastLogin: false, updated: false, index: false, tokens: false };
    const execute = async (statement: string) => {
      if (statement.includes("ADD module_access")) state.moduleAccess = true;
      if (statement.includes("ADD last_login_at")) state.lastLogin = true;
      if (statement.includes("UPDATE users SET module_access")) {
        if (!state.moduleAccess) throw new Error("Invalid column name 'module_access'");
        state.updated = true;
      }
      if (statement.includes("CREATE UNIQUE INDEX uq_users_email_ci")) state.index = true;
      if (statement.includes("CREATE TABLE user_access_tokens")) state.tokens = true;
    };
    const batches = sqlBatches(migration, "azure-sql");
    await execute(batches[0]);
    await execute(batches[1]);
    const markApplied = vi.fn(async () => undefined);
    await executeAndMarkMigration(migration, "azure-sql", execute, markApplied);
    expect(state).toEqual({ moduleAccess: true, lastLogin: true, updated: true, index: true, tokens: true });
    expect(markApplied).toHaveBeenCalledOnce();
  });

  it("preserves existing identities, hashes and operational records through migration 9", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT NOT NULL,password_hash TEXT NOT NULL,name TEXT,role TEXT,venue_id INTEGER,active INTEGER,created_at TEXT);
      CREATE TABLE venues(id INTEGER PRIMARY KEY); CREATE TABLE locations(id INTEGER PRIMARY KEY);
      CREATE TABLE assets(id INTEGER PRIMARY KEY); CREATE TABLE pat_tests(id INTEGER PRIMARY KEY);
      CREATE TABLE extinguishers(id INTEGER PRIMARY KEY); CREATE TABLE fire_alarm_call_points(id INTEGER PRIMARY KEY); CREATE TABLE fire_alarm_tests(id INTEGER PRIMARY KEY);
      CREATE TABLE documents(id INTEGER PRIMARY KEY); CREATE TABLE document_attachments(id INTEGER PRIMARY KEY);
      CREATE TABLE risk_assessments(id INTEGER PRIMARY KEY); CREATE TABLE risk_hazards(id INTEGER PRIMARY KEY); CREATE TABLE risk_assessment_history(id INTEGER PRIMARY KEY);
      CREATE TABLE food_task_templates(id INTEGER PRIMARY KEY); CREATE TABLE food_temperature_readings(id INTEGER PRIMARY KEY); CREATE TABLE food_delivery_records(id INTEGER PRIMARY KEY);
      CREATE TABLE actions(id INTEGER PRIMARY KEY); CREATE TABLE audit_events(id INTEGER PRIMARY KEY);
      INSERT INTO users VALUES(42,'admin@villagelimits.test','unchanged-hash','Administrator','administrator',1,1,'2026-01-01');
      INSERT INTO venues VALUES(1); INSERT INTO locations VALUES(1); INSERT INTO assets VALUES(1); INSERT INTO pat_tests VALUES(1);
      INSERT INTO extinguishers VALUES(1); INSERT INTO fire_alarm_call_points VALUES(1); INSERT INTO fire_alarm_tests VALUES(1);
      INSERT INTO documents VALUES(1); INSERT INTO document_attachments VALUES(1); INSERT INTO risk_assessments VALUES(1); INSERT INTO risk_hazards VALUES(1); INSERT INTO risk_assessment_history VALUES(1);
      INSERT INTO food_task_templates VALUES(1); INSERT INTO food_temperature_readings VALUES(1); INSERT INTO food_delivery_records VALUES(1); INSERT INTO actions VALUES(1); INSERT INTO audit_events VALUES(1);
    `);
    database.exec(migrations.find((item) => item.version === 9)!.sqlite);
    const admin = database.prepare("SELECT id,password_hash,role,module_access FROM users WHERE id=42").get() as any;
    expect(admin).toEqual({ id: 42, password_hash: "unchanged-hash", role: "administrator", module_access: "both" });
    for (const table of ["venues","locations","assets","pat_tests","extinguishers","fire_alarm_call_points","fire_alarm_tests","documents","document_attachments","risk_assessments","risk_hazards","risk_assessment_history","food_task_templates","food_temperature_readings","food_delivery_records","actions","audit_events"])
      expect((database.prepare(`SELECT count(*) count FROM ${table}`).get() as any).count, table).toBe(1);
    database.close();
  });
});
