import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";
import bcrypt from "bcryptjs";
import { config, demoSeedEnabled } from "./config.js";
import { executeAndMarkMigration, migrations } from "./migrations.js";

export type RunResult = { lastInsertRowid: number; changes?: number };
export interface DatabaseAdapter {
  readonly provider: "sqlite" | "azure-sql";
  get<T = Record<string, unknown>>(
    statement: string,
    params?: unknown[],
  ): Promise<T | undefined>;
  all<T = Record<string, unknown>>(
    statement: string,
    params?: unknown[],
  ): Promise<T[]>;
  run(statement: string, params?: unknown[]): Promise<RunResult>;
  exec(statement: string): Promise<void>;
  allocateAssetReference(venueId: number): Promise<string>;
}

const formatAssetReference = (number: number) =>
  `VL-${String(number).padStart(6, "0")}`;

class SqliteAdapter implements DatabaseAdapter {
  readonly provider = "sqlite" as const;
  readonly raw: DatabaseSync;
  constructor(path: string) {
    const absolute = resolve(path);
    mkdirSync(dirname(absolute), { recursive: true });
    this.raw = new DatabaseSync(absolute);
    this.raw.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
  }
  async get<T>(statement: string, params: unknown[] = []) {
    return this.raw.prepare(statement).get(...(params as SQLInputValue[])) as
      T | undefined;
  }
  async all<T>(statement: string, params: unknown[] = []) {
    return this.raw
      .prepare(statement)
      .all(...(params as SQLInputValue[])) as T[];
  }
  async run(statement: string, params: unknown[] = []) {
    const result = this.raw
      .prepare(statement)
      .run(...(params as SQLInputValue[]));
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }
  async exec(statement: string) {
    this.raw.exec(statement);
  }
  async allocateAssetReference(venueId: number) {
    this.raw
      .prepare(
        "INSERT OR IGNORE INTO asset_reference_sequences(venue_id,next_number) VALUES(?,1)",
      )
      .run(venueId);
    const allocated = Number(
      (this.raw.prepare("SELECT max(next_number) allocated FROM asset_reference_sequences").get() as { allocated: number }).allocated,
    );
    this.raw.prepare("UPDATE asset_reference_sequences SET next_number=? WHERE venue_id=?").run(allocated + 1, venueId);
    return formatAssetReference(allocated);
  }
}

class AzureSqlAdapter implements DatabaseAdapter {
  readonly provider = "azure-sql" as const;
  private credential = new DefaultAzureCredential();
  private connection?: sql.ConnectionPool;
  private expiresAt = 0;
  private async pool() {
    if (this.connection?.connected && Date.now() < this.expiresAt - 300_000)
      return this.connection;
    if (this.connection) await this.connection.close().catch(() => undefined);
    const token = await this.credential.getToken(
      "https://database.windows.net/.default",
    );
    if (!token)
      throw new Error("Managed identity could not obtain an Azure SQL token");
    this.expiresAt = token.expiresOnTimestamp;
    this.connection = await new sql.ConnectionPool({
      server: config.AZURE_SQL_SERVER!,
      database: config.AZURE_SQL_DATABASE!,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true,
      },
      authentication: {
        type: "azure-active-directory-access-token",
        options: { token: token.token },
      },
      pool: { min: 0, max: 10, idleTimeoutMillis: 30_000 },
      connectionTimeout: 30_000,
      requestTimeout: 30_000,
    }).connect();
    return this.connection;
  }
  private bind(statement: string, params: unknown[]) {
    let index = 0;
    let transformed = statement.replace(/\?/g, () => `@p${index++}`);
    transformed = transformed.replace(
      /\s+LIMIT\s+(\d+)\s*$/i,
      " OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY",
    );
    return { transformed, params };
  }
  private async request(
    statement: string,
    params: unknown[],
    identity = false,
  ) {
    const pool = await this.pool(),
      request = pool.request(),
      bound = this.bind(statement, params);
    bound.params.forEach((value, index) =>
      request.input(`p${index}`, value === undefined ? null : (value as any)),
    );
    const query = identity
      ? `${bound.transformed}; SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS insertedId;`
      : bound.transformed;
    return request.query(query);
  }
  async get<T>(statement: string, params: unknown[] = []) {
    return (await this.request(statement, params)).recordset?.[0] as
      T | undefined;
  }
  async all<T>(statement: string, params: unknown[] = []) {
    return ((await this.request(statement, params)).recordset || []) as T[];
  }
  async run(statement: string, params: unknown[] = []) {
    const insert = /^\s*INSERT\s/i.test(statement);
    const result = await this.request(statement, params, insert);
    const recordsets = result.recordsets as any[];
    return {
      lastInsertRowid: insert
        ? Number(recordsets?.[recordsets.length - 1]?.[0]?.insertedId || 0)
        : 0,
      changes: result.rowsAffected?.[0],
    };
  }
  async exec(statement: string) {
    const pool = await this.pool();
    await pool.request().batch(statement);
  }
  async allocateAssetReference(venueId: number) {
    const transaction = new sql.Transaction(await this.pool());
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = new sql.Request(transaction);
      request.input("venueId", sql.BigInt, venueId);
      const result = await request.query<{ allocated: number }>(`
        DECLARE @lockResult INT;
        EXEC @lockResult = sp_getapplock
          @Resource = 'vl-asset-reference-global',
          @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @lockResult < 0 THROW 50001, 'Could not allocate asset reference', 1;
        IF NOT EXISTS (SELECT 1 FROM asset_reference_sequences WHERE venue_id=@venueId)
          INSERT INTO asset_reference_sequences(venue_id,next_number) VALUES(@venueId,1);
        DECLARE @allocated BIGINT;
        SELECT @allocated=MAX(next_number) FROM asset_reference_sequences;
        UPDATE asset_reference_sequences SET next_number=@allocated+1 WHERE venue_id=@venueId;
        SELECT @allocated AS allocated;`);
      await transaction.commit();
      return formatAssetReference(Number(result.recordset[0].allocated));
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }
  async migrateVersioned() {
    const transaction = new sql.Transaction(await this.pool());
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const lock = await new sql.Request(transaction).query(`
        DECLARE @lockResult INT;
        EXEC @lockResult = sp_getapplock
          @Resource = 'vl-compliance-schema-migrations',
          @LockMode = 'Exclusive',
          @LockOwner = 'Transaction',
          @LockTimeout = 60000;
        SELECT @lockResult AS lockResult;`);
      if (Number(lock.recordset?.[0]?.lockResult) < 0)
        throw new Error("Could not acquire the Azure SQL migration lock");
      await new sql.Request(transaction).batch(
        "IF OBJECT_ID('schema_migrations','U') IS NULL CREATE TABLE schema_migrations(version INT PRIMARY KEY,name NVARCHAR(250) NOT NULL,applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())",
      );
      const appliedRows = await new sql.Request(transaction).query<{
        version: number;
      }>("SELECT version FROM schema_migrations");
      const applied = new Set(
        appliedRows.recordset.map((row) => Number(row.version)),
      );
      for (const migration of migrations) {
        if (applied.has(migration.version)) continue;
        await executeAndMarkMigration(
          migration,
          "azure-sql",
          (statement) => new sql.Request(transaction).batch(statement),
          async () => {
            const request = new sql.Request(transaction);
            request.input("version", sql.Int, migration.version);
            request.input("name", sql.NVarChar(250), migration.name);
            await request.query("INSERT INTO schema_migrations(version,name) VALUES(@version,@name)");
          },
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }
}

export function createDatabase(): DatabaseAdapter {
  return config.DATABASE_PROVIDER === "azure-sql"
    ? new AzureSqlAdapter()
    : new SqliteAdapter(config.SQLITE_PATH);
}
export const db = createDatabase();

export async function migrateDatabase() {
  if (db instanceof AzureSqlAdapter) await db.migrateVersioned();
  else {
    await db.exec("BEGIN IMMEDIATE");
    try {
    await db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    );
    const applied = new Set(
      (
        await db.all<{ version: number }>(
          "SELECT version FROM schema_migrations",
        )
      ).map((row) => Number(row.version)),
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await executeAndMarkMigration(
        migration,
        "sqlite",
        (statement) => db.exec(statement),
        () => db.run("INSERT INTO schema_migrations(version,name) VALUES(?,?)", [migration.version, migration.name]),
      );
    }
    if (demoSeedEnabled()) await seedDemo();
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
  const { bootstrapRiskLibrary, reviewBootstrappedRiskContent } = await import("./risk-library.js");
  await bootstrapRiskLibrary(db);
  await reviewBootstrappedRiskContent(db);
}

async function seedDemo() {
  let venue = await db.get<{ id: number }>("SELECT id FROM venues LIMIT 1");
  if (!venue) {
    venue = {
      id: (
        await db.run("INSERT INTO venues(name,is_demo) VALUES(?,1)", [
          "Village Limits (DEMO)",
        ])
      ).lastInsertRowid,
    };
    for (const name of [
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
      await db.run("INSERT INTO locations(venue_id,name) VALUES(?,?)", [
        venue.id,
        name,
      ]);
  }
  if (!(await db.get("SELECT id FROM users LIMIT 1")))
    await db.run(
      "INSERT INTO users(email,password_hash,name,role,module_access,venue_id) VALUES(?,?,?,?,?,?)",
      [
        "admin@demo.local",
        bcrypt.hashSync("ChangeMe!123", 12),
        "Demo Administrator",
        "administrator",
        "both",
        venue.id,
      ],
    );
  if (!(await db.get("SELECT id FROM assets LIMIT 1"))) {
    const location = await db.get<{ id: number }>(
      "SELECT id FROM locations WHERE venue_id=? AND name=?",
      [venue.id, "Main Kitchen"],
    );
    await db.run(
      "INSERT INTO assets(barcode,description,category,venue_id,location_id,pat_status,is_demo) VALUES(?,?,?,?,?,?,1)",
      [
        "VL-DEMO-001",
        "Demo commercial toaster",
        "Kitchen Equipment",
        venue.id,
        location!.id,
        "PAT Required",
      ],
    );
  }
}

export const rows = <T = Record<string, unknown>>(
  statement: string,
  ...params: unknown[]
) => db.all<T>(statement, params);
export async function audit(
  entityType: string,
  entityId: number | null,
  action: string,
  before: unknown,
  after: unknown,
  userId?: number,
  ip?: string,
) {
  await db.run(
    "INSERT INTO audit_events(entity_type,entity_id,action,before_json,after_json,user_id,ip_address) VALUES(?,?,?,?,?,?,?)",
    [
      entityType,
      entityId,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      userId || null,
      ip || null,
    ],
  );
}
