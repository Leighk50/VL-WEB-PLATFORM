import { describe, expect, it, vi } from "vitest";
import {
  copyStatement,
  dependencyOrder,
  destinationIsBootstrapOnly,
  rollbackTransaction,
  sameCounts,
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
  });

  it("preserves identity IDs, administrator hashes and all ordinary values", () => {
    const statement = copyStatement(config.sourceDatabase, config.destinationDatabase, users);
    expect(statement).toContain("([id],[email],[password_hash]) SELECT [id],[email],[password_hash]");
    expect(statement).not.toContain("schema_migrations");
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
    const request = vi.fn(async (query: string) => ({ recordset: [{ invalid: query.includes("[users]") ? 1 : 0 }] }));
    await expect(destinationIsBootstrapOnly(request, config.sourceDatabase, config.destinationDatabase, ["venues", "users"])).resolves.toBe(false);
  });

  it("accepts only the known venue/template/hazard/CP01-CP05 bootstrap graph", async () => {
    const request = vi.fn(async () => ({ recordset: [{ invalid: 0 }] }));
    await expect(destinationIsBootstrapOnly(request, config.sourceDatabase, config.destinationDatabase, [
      "venues", "locations", "risk_assessments", "risk_hazards", "risk_template_registry", "fire_alarm_call_points",
    ])).resolves.toBe(true);
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
