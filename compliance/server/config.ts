import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_PROVIDER: z.enum(["sqlite", "azure-sql"]).default("sqlite"),
    SQLITE_PATH: z.string().default(".data/compliance.db"),
    AZURE_SQL_SERVER: z.string().optional(),
    AZURE_SQL_DATABASE: z.string().optional(),
    STORAGE_PROVIDER: z.enum(["local", "azure-blob"]).default("local"),
    LOCAL_STORAGE_PATH: z.string().default(".data/uploads"),
    AZURE_STORAGE_ACCOUNT: z.string().optional(),
    AZURE_STORAGE_CONTAINER: z.string().default("compliance-private"),
    JWT_SECRET: z.string().optional(),
    DEMO_SEED: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(4100),
  })
  .passthrough();

export type AppConfig = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = schema.parse(env);
  if (config.NODE_ENV === "production") {
    if (
      !config.JWT_SECRET ||
      config.JWT_SECRET.length < 32 ||
      /change|local|demo|secret/i.test(config.JWT_SECRET)
    )
      throw new Error(
        "Production JWT_SECRET must be an unsafe-pattern-free random value of at least 32 characters",
      );
    if (
      config.DATABASE_PROVIDER !== "azure-sql" ||
      !config.AZURE_SQL_SERVER ||
      !config.AZURE_SQL_DATABASE
    )
      throw new Error(
        "Production requires managed-identity Azure SQL configuration",
      );
    if (
      config.STORAGE_PROVIDER !== "azure-blob" ||
      !config.AZURE_STORAGE_ACCOUNT
    )
      throw new Error(
        "Production requires managed-identity Azure Blob configuration",
      );
  }
  return config;
}

export const config = loadConfig();
export const demoSeedEnabled = () =>
  config.NODE_ENV !== "production" && config.DEMO_SEED === "true";
