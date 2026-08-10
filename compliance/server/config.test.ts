import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const production = {
  NODE_ENV: "production",
  DATABASE_PROVIDER: "azure-sql",
  AZURE_SQL_SERVER: "vl-compliance-staging-sql.database.windows.net",
  AZURE_SQL_DATABASE: "vl-compliance-staging-db",
  STORAGE_PROVIDER: "azure-blob",
  AZURE_STORAGE_ACCOUNT: "vlcompliancestaging",
  AZURE_STORAGE_CONTAINER: "compliance-private",
  JWT_SECRET: "7wG8UuQnK5fJ3vN9xR2mP6aB4dC8eH1z",
};

describe("production configuration", () => {
  it("selects managed-identity Azure providers", () => {
    const config = loadConfig(production);
    expect(config.DATABASE_PROVIDER).toBe("azure-sql");
    expect(config.STORAGE_PROVIDER).toBe("azure-blob");
    expect(config.AZURE_STORAGE_CONTAINER).toBe("compliance-private");
  });
  it("fails without a production JWT secret", () => {
    expect(() => loadConfig({ ...production, JWT_SECRET: undefined })).toThrow(
      /JWT_SECRET/,
    );
  });
  it("fails for unsafe or local production providers", () => {
    expect(() =>
      loadConfig({
        ...production,
        JWT_SECRET: "change-this-secret-change-this-secret",
      }),
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      loadConfig({ ...production, DATABASE_PROVIDER: "sqlite" }),
    ).toThrow(/Azure SQL/);
    expect(() =>
      loadConfig({ ...production, STORAGE_PROVIDER: "local" }),
    ).toThrow(/Azure Blob/);
  });
});
