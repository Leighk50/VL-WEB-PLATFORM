import { describe, expect, it, vi } from "vitest";
import {
  createReadOnlySourceQuery,
  classifyDestination,
  describeRowDifferences,
  dependencyOrder,
  destinationIsBootstrapOnly,
  discoverSeparateSchemas,
  discoverSchema,
  insertRowStatement,
  isPreservableFailedLoginAuditRow,
  rollbackTransaction,
  resolveMigrationConfig,
  sameCounts,
  selectRowsStatement,
  sqlTypeForColumn,
  sourcePredicate,
  validateMigrationConfig,
  type TableSchema,
} from "./staging-data-migration.js";

const config = {
  server: "vl-compliance-staging-sql.database.windows.net",
  sourceDatabase: "vl-compliance-staging-db",
  destinationDatabase: "vl-compliance-staging-db-gp",
};
const users: TableSchema = {
  name: "users",
  columns: [
    { name: "id", type: "bigint", identity: true, computed: false },
    { name: "email", type: "nvarchar", identity: false, computed: false },
    { name: "password_hash", type: "nvarchar", identity: false, computed: false },
  ],
};

describe("staging data migration safety", () => {
  it("requires explicit, distinct and safe database names", () => {
    expect(() => validateMigrationConfig(config)).not.toThrow();
    expect(() => validateMigrationConfig({ ...config, destinationDatabase: config.sourceDatabase.toUpperCase() })).toThrow(/different/);
    expect(() => validateMigrationConfig({ ...config, sourceDatabase: "db]; DROP TABLE users;--" })).toThrow(/unsafe/);
    expect(() => validateMigrationConfig({ ...config, destinationDatabase: "some-other-db" })).toThrow(/staging destination/);
  });

  it("defaults only the staging source and requires the App Service destination", () => {
    const resolved = resolveMigrationConfig({
      AZURE_SQL_SERVER: config.server,
      AZURE_SQL_DATABASE: config.destinationDatabase,
    });
    expect(resolved.sourceDatabase).toBe("vl-compliance-staging-db");
    expect(resolved.destinationDatabase).toBe("vl-compliance-staging-db-gp");
    expect(() =>
      validateMigrationConfig(
        resolveMigrationConfig({ AZURE_SQL_SERVER: config.server }),
      ),
    ).toThrow(/AZURE_SQL_DATABASE/);
  });

  it("preserves identity IDs, administrator hashes and all ordinary values", () => {
    expect(selectRowsStatement(users)).toContain("SELECT [id],[email],[password_hash] FROM [dbo].[users]");
    expect(insertRowStatement(users)).toContain("([id],[email],[password_hash]) VALUES (@r0c0,@r0c1,@r0c2)");
  });

  it("round-trips DATE and DATETIME2 values through exact ISO conversion", () => {
    const actions: TableSchema = {
      name: "actions",
      columns: [
        { name: "id", type: "bigint", identity: true, computed: false },
        { name: "due_date", type: "date", identity: false, computed: false },
        { name: "created_at", type: "datetime2", scale: 7, identity: false, computed: false },
      ],
    };
    expect(selectRowsStatement(actions)).toContain(
      "CONVERT(nvarchar(64),[due_date],126) [due_date]",
    );
    expect(selectRowsStatement(actions)).toContain(
      "CONVERT(nvarchar(64),[created_at],126) [created_at]",
    );
    expect(insertRowStatement(actions)).toContain(
      "CONVERT(date,@r0c1,126)",
    );
    expect(insertRowStatement(actions)).toContain(
      "CONVERT(datetime2(7),@r0c2,126)",
    );
    expect(sqlTypeForColumn(actions.columns[2]!)).toBeDefined();
  });

  it("reports mismatch IDs and column names without logging values", () => {
    const expected = [{ id: 3, description: "Private source value", created_at: "2026-08-14T12:00:00.1234567" }];
    const actual = [{ id: 3, description: "Private source value", created_at: "2026-08-14T12:00:00.1230000" }];
    const details = describeRowDifferences(expected, actual, [
      { name: "id", type: "bigint", identity: true, computed: false },
      { name: "description", type: "nvarchar", identity: false, computed: false },
      { name: "created_at", type: "datetime2", scale: 7, identity: false, computed: false },
    ]);
    expect(details).toEqual(["id=3: created_at"]);
    expect(details.join(" ")).not.toContain("Private source value");
    expect(details.join(" ")).not.toContain("2026-08-14");
  });

  it("filters only unambiguously marked demo parent rows", () => {
    expect(sourcePredicate(users)).toBe("");
    expect(sourcePredicate({ ...users, columns: [...users.columns, { name: "is_demo", type: "bit", identity: false, computed: false }] })).toContain("is_demo");
  });

  it("orders foreign-key parents before children and tolerates self-version links", () => {
    const order = dependencyOrder(
      ["risk_assessment_history", "risk_assessments", "venues", "risk_hazards"],
      [
        { parent: "risk_assessments", referenced: "venues" },
        { parent: "risk_assessments", referenced: "risk_assessments" },
        { parent: "risk_hazards", referenced: "risk_assessments" },
        { parent: "risk_assessment_history", referenced: "risk_assessments" },
      ],
    );
    expect(order.indexOf("venues")).toBeLessThan(order.indexOf("risk_assessments"));
    expect(order.indexOf("risk_assessments")).toBeLessThan(order.indexOf("risk_hazards"));
    expect(order.indexOf("risk_assessments")).toBeLessThan(order.indexOf("risk_assessment_history"));
  });

  it("rejects destination data outside the bootstrap graph, including users", async () => {
    const source = vi.fn(async () => ({ recordset: [] }));
    const destination = vi.fn(async (query: string) => ({
      recordset: query.includes("[users]") ? [{ count: 1 }] : [{ invalid: 0 }],
    }));
    await expect(destinationIsBootstrapOnly(source, destination, ["venues", "users"], { venues: 1, users: 1 })).resolves.toBe(false);
  });

  it("accepts only the known venue/template/hazard/CP01-CP05 bootstrap graph", async () => {
    const source = vi.fn(async () => ({ recordset: [] }));
    const destination = vi.fn(async (query: string) => ({
      recordset: query.includes("CASE WHEN") ? [{ invalid: 0 }] : [],
    }));
    await expect(destinationIsBootstrapOnly(source, destination, [
      "venues", "locations", "risk_assessments", "risk_hazards", "risk_template_registry", "fire_alarm_call_points",
    ])).resolves.toBe(true);
  });

  it("discovers metadata through separate local connection objects without Azure SQL cross-database names", async () => {
    const sourceSql: string[] = [], destinationSql: string[] = [];
    const metadata = (log: string[]) => vi.fn(async (query: string) => {
      log.push(query);
      if (query.includes("FROM sys.tables")) return { recordset: [{ name: "users" }] };
      if (query.includes("FROM sys.columns")) return { recordset: users.columns };
      return { recordset: [] };
    });
    const source = metadata(sourceSql), destination = metadata(destinationSql);
    await discoverSeparateSchemas(source, destination);
    expect(source).toHaveBeenCalled();
    expect(destination).toHaveBeenCalled();
    expect(sourceSql.join("\n")).not.toContain("vl-compliance-staging-db.sys.");
    expect(destinationSql.join("\n")).not.toContain("vl-compliance-staging-db-gp.sys.");
    expect([...sourceSql, ...destinationSql].every((query) => /\bsys\.(tables|schemas|columns|types|foreign_keys)\b/.test(query))).toBe(true);
  });

  it("classifies current schema plus schema_migrations and zero application rows as EMPTY", async () => {
    const discovery = vi.fn(async (query: string) => {
      if (query.includes("FROM sys.tables"))
        return { recordset: [{ name: "Schema_Migrations " }, { name: "venues" }, { name: "users" }] };
      if (query.includes("OBJECT_ID('dbo.venues')")) return { recordset: [] };
      if (query.includes("OBJECT_ID('dbo.users')")) return { recordset: [] };
      return { recordset: [] };
    });
    const schema = await discoverSchema(discovery);
    expect(schema.tables.map((table) => table.name)).toEqual(["venues", "users"]);
    expect(discovery.mock.calls.flat().join("\n").toLowerCase()).toContain("schema_migrations");
    const source = vi.fn(async () => ({ recordset: [] }));
    const destination = vi.fn(async () => ({ recordset: [] }));
    await expect(
      classifyDestination(source, destination, ["venues", "users"], {
        venues: 0,
        users: 0,
      }),
    ).resolves.toEqual({
      classification: "EMPTY",
      reasons: [
        "All 2 discovered application tables contain zero rows",
        "schema_migrations and SQL/Azure system metadata are excluded from application-data classification",
      ],
    });
    expect(source).not.toHaveBeenCalled();
    expect(destination).not.toHaveBeenCalled();
  });

  it("reports the exact non-bootstrap table that makes a destination REAL_DATA", async () => {
    const source = vi.fn(async () => ({ recordset: [] }));
    const destination = vi.fn(async (query: string) => ({
      recordset: query.includes("COUNT_BIG(*) invalid")
        ? [{ invalid: 0 }]
        : [],
    }));
    const report = await classifyDestination(
      source,
      destination,
      ["venues", "users"],
      { venues: 0, users: 1 },
    );
    expect(report.classification).toBe("REAL_DATA");
    expect(report.reasons).toContain(
      "users: 1 row(s) in a non-bootstrap application table",
    );
  });

  it("accepts only the exact orphaned failed-login audit shape as preservable", async () => {
    const failedLogin = {
      id: 1,
      entity_type: "session",
      entity_id: null,
      action: "login_failed",
      before_json: null,
      after_json: '{"emailHash":"redacted"}',
      user_id: null,
      occurred_at: new Date("2026-08-14T17:00:00Z"),
      ip_address: "redacted",
    };
    expect(isPreservableFailedLoginAuditRow(failedLogin)).toBe(true);
    expect(
      isPreservableFailedLoginAuditRow({ ...failedLogin, action: "login" }),
    ).toBe(false);
    expect(
      isPreservableFailedLoginAuditRow({ ...failedLogin, user_id: 1 }),
    ).toBe(false);
    expect(
      isPreservableFailedLoginAuditRow({ ...failedLogin, entity_id: 1 }),
    ).toBe(false);
    expect(
      isPreservableFailedLoginAuditRow({ ...failedLogin, before_json: "{}" }),
    ).toBe(false);
  });

  it("classifies exact pre-migration failed-login evidence as safely preservable", async () => {
    const source = vi.fn(async () => ({ recordset: [] }));
    const destination = vi.fn(async (query: string) => ({
      recordset: query.includes("COUNT_BIG(*) invalid")
        ? [{ invalid: 0 }]
        : [],
    }));
    const report = await classifyDestination(
      source,
      destination,
      ["audit_events", "venues", "users"],
      { audit_events: 1, venues: 0, users: 0 },
    );
    expect(report).toEqual({
      classification: "BOOTSTRAP_ONLY",
      reasons: [
        "audit_events: 1 preservable pre-migration failed-login audit row(s)",
      ],
    });
  });

  it("makes source writes impossible through the migration source query path", async () => {
    const execute = vi.fn(async () => ({ recordset: [] }));
    const source = createReadOnlySourceQuery(execute);
    await expect(source("SELECT * FROM sys.tables")).resolves.toEqual({ recordset: [] });
    await expect(source("DELETE FROM [dbo].[users]")).rejects.toThrow(/SELECT queries only/);
    await expect(source("ALTER TABLE [dbo].[users] ADD x int")).rejects.toThrow(/SELECT queries only/);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("detects completed count sets for explicit rerun refusal", () => {
    expect(sameCounts({ users: 2, risk_assessments: 40 }, { users: 2, risk_assessments: 40 })).toBe(true);
    expect(sameCounts({ users: 2 }, { users: 1 })).toBe(false);
  });

  it("rolls back a failed migration transaction", async () => {
    const rollback = vi.fn(async () => undefined);
    await rollbackTransaction({ rollback } as never);
    expect(rollback).toHaveBeenCalledOnce();
  });
});
