import { describe, expect, it, vi } from "vitest";
import {
  createReadOnlySourceQuery,
  dependencyOrder,
  destinationIsBootstrapOnly,
  discoverSeparateSchemas,
  insertRowStatement,
  rollbackTransaction,
  resolveMigrationConfig,
  sameCounts,
  selectRowsStatement,
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
    const destination = vi.fn(async (query: string) => ({ recordset: [{ invalid: query.includes("[users]") ? 1 : 0 }] }));
    await expect(destinationIsBootstrapOnly(source, destination, ["venues", "users"])).resolves.toBe(false);
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
