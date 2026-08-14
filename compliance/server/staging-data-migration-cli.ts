import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  EXCLUDED_TABLES,
  copyStatement,
  dependencyOrder,
  destinationIsBootstrapOnly,
  qualified,
  sameCounts,
  sourcePredicate,
  validateMigrationConfig,
  type Column,
  type ForeignKey,
  type MigrationConfig,
  type TableCounts,
  type TableSchema,
} from "./staging-data-migration.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const verifyOnly = args.has("--verify-only");
const knownArgs = new Set(["--dry-run", "--verify-only"]);
for (const arg of args) if (!knownArgs.has(arg)) throw new Error(`Unknown argument: ${arg}`);
if (dryRun && verifyOnly) throw new Error("Choose either --dry-run or --verify-only");

const config: MigrationConfig = {
  server: process.env.AZURE_SQL_SERVER || "",
  sourceDatabase: process.env.SOURCE_AZURE_SQL_DATABASE || "",
  destinationDatabase: process.env.AZURE_SQL_DATABASE || "",
  storageAccount: process.env.AZURE_STORAGE_ACCOUNT,
  storageContainer: process.env.AZURE_STORAGE_CONTAINER || "compliance-private",
};
validateMigrationConfig(config);

console.log("Compliance Hub one-time data migration");
console.log(`Source (read-only queries): ${config.server} / ${config.sourceDatabase}`);
console.log(`Destination:                ${config.server} / ${config.destinationDatabase}`);
console.log(`Mode:                       ${verifyOnly ? "VERIFY ONLY" : dryRun ? "DRY RUN" : "WRITE"}`);

const credential = new DefaultAzureCredential();
const token = await credential.getToken("https://database.windows.net/.default");
if (!token) throw new Error("Managed identity could not obtain an Azure SQL token");
const pool = await new sql.ConnectionPool({
  server: config.server,
  database: config.destinationDatabase,
  options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  authentication: { type: "azure-active-directory-access-token", options: { token: token.token } },
  pool: { min: 0, max: 4, idleTimeoutMillis: 30_000 },
  connectionTimeout: 30_000,
  requestTimeout: 300_000,
}).connect();

const query = (text: string) => pool.request().query(text);

async function discover(database: string) {
  const tablesResult = await query(`SELECT t.name FROM ${identifierDatabase(database)}.sys.tables t JOIN ${identifierDatabase(database)}.sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='dbo' AND t.is_ms_shipped=0 ORDER BY t.name`);
  const names = (tablesResult.recordset as Array<{ name: string }>).map((row) => row.name).filter((name) => !EXCLUDED_TABLES.has(name));
  const tables: TableSchema[] = [];
  for (const name of names) {
    const result = await query(`SELECT c.name,ty.name [type],CONVERT(bit,c.is_identity) [identity],CONVERT(bit,c.is_computed) [computed] FROM ${identifierDatabase(database)}.sys.columns c JOIN ${identifierDatabase(database)}.sys.types ty ON c.user_type_id=ty.user_type_id WHERE c.object_id=OBJECT_ID('${database.replace(/'/g, "''")}.dbo.${name.replace(/'/g, "''")}') ORDER BY c.column_id`);
    tables.push({ name, columns: result.recordset as Column[] });
  }
  const fkResult = await query(`SELECT pt.name parent,rt.name referenced FROM ${identifierDatabase(database)}.sys.foreign_keys fk JOIN ${identifierDatabase(database)}.sys.tables pt ON pt.object_id=fk.parent_object_id JOIN ${identifierDatabase(database)}.sys.tables rt ON rt.object_id=fk.referenced_object_id`);
  return { tables, foreignKeys: fkResult.recordset as ForeignKey[] };
}

function identifierDatabase(value: string) { return `[${value.replace(/]/g, "]]" )}]`; }

async function counts(database: string, tables: TableSchema[], source = false) {
  const result: TableCounts = {};
  for (const table of tables) {
    const row = await query(`SELECT COUNT_BIG(*) count FROM ${qualified(database, table.name)}${source ? sourcePredicate(table) : ""}`);
    result[table.name] = Number(row.recordset[0].count);
  }
  return result;
}

async function validateSchema(source: TableSchema[], destination: TableSchema[]) {
  const sourceByName = new Map(source.map((table) => [table.name, table]));
  for (const table of destination) {
    const sourceTable = sourceByName.get(table.name);
    if (!sourceTable) throw new Error(`Source is missing destination application table ${table.name}`);
    const sourceColumns = new Map(sourceTable.columns.map((column) => [column.name, column]));
    for (const column of table.columns.filter((item) => !item.computed && item.type !== "timestamp")) {
      const sourceColumn = sourceColumns.get(column.name);
      if (!sourceColumn || sourceColumn.type !== column.type)
        throw new Error(`Schema mismatch at ${table.name}.${column.name}`);
    }
  }
  const destinationNames = new Set(destination.map((table) => table.name));
  for (const table of source) if (!destinationNames.has(table.name))
    throw new Error(`Destination is missing source application table ${table.name}`);
}

async function validateData(tables: TableSchema[], sourceCounts: TableCounts) {
  const destinationCounts = await counts(config.destinationDatabase, tables);
  for (const table of tables) {
    const ok = sourceCounts[table.name] === destinationCounts[table.name];
    console.log(`${table.name}: source=${sourceCounts[table.name]} destination=${destinationCounts[table.name]} validation=${ok ? "PASS" : "FAIL"}`);
    if (!ok) throw new Error(`Row count validation failed for ${table.name}`);
  }
  for (const table of tables) {
    const columns = table.columns.filter((column) => !column.computed && column.type !== "timestamp");
    const list = columns.map((column) => `[${column.name.replace(/]/g, "]]" )}]`).join(",");
    const source = `SELECT ${list} FROM ${qualified(config.sourceDatabase, table.name)}${sourcePredicate(table)}`;
    const destination = `SELECT ${list} FROM ${qualified(config.destinationDatabase, table.name)}`;
    const difference = await query(`SELECT CASE WHEN EXISTS(${source} EXCEPT ${destination}) OR EXISTS(${destination} EXCEPT ${source}) THEN 1 ELSE 0 END invalid`);
    if (Number(difference.recordset[0].invalid)) throw new Error(`Value/ID validation failed for ${table.name}`);
  }
  const constraints = await query("DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS");
  if (constraints.recordset?.length) throw new Error("Destination foreign-key/check-constraint validation failed");
  const admin = await query(`SELECT COUNT_BIG(*) count FROM ${qualified(config.destinationDatabase, "users")} WHERE [role]='administrator' AND [active]=1`);
  if (Number(admin.recordset[0].count) < 1) throw new Error("No active administrator exists in the migrated destination");
  const venues = await query(`SELECT COUNT_BIG(*) count FROM ${qualified(config.destinationDatabase, "venues")} WHERE LOWER([name])='village limits' AND ISNULL([is_demo],0)=0`);
  if (Number(venues.recordset[0].count) !== 1) throw new Error("Village Limits venue does not exist exactly once");
  if (tables.some((table) => table.name === "document_attachments")) {
    const keys = await query(`SELECT [storage_key] FROM ${qualified(config.sourceDatabase, "document_attachments")} EXCEPT SELECT [storage_key] FROM ${qualified(config.destinationDatabase, "document_attachments")}`);
    if (keys.recordset.length) throw new Error("Attachment storage keys were not preserved exactly");
  }
}

async function verifyBlobSamples(tables: TableSchema[]) {
  if (!config.storageAccount) {
    console.log("Blob sample check: SKIPPED (AZURE_STORAGE_ACCOUNT not set)");
    return;
  }
  const sources = tables.filter((table) => ["document_attachments", "documents", "photos"].includes(table.name) && table.columns.some((column) => column.name === "storage_key"));
  const keys: string[] = [];
  for (const table of sources) {
    const rows = await query(`SELECT TOP (3) [storage_key] FROM ${qualified(config.sourceDatabase, table.name)} WHERE [storage_key] IS NOT NULL ORDER BY NEWID()`);
    keys.push(...rows.recordset.map((row: { storage_key: string }) => row.storage_key));
  }
  const container = new BlobServiceClient(`https://${config.storageAccount}.blob.core.windows.net`, credential).getContainerClient(config.storageContainer!);
  for (const key of [...new Set(keys)].slice(0, 5)) if (!(await container.getBlobClient(key).exists())) throw new Error("A sampled private attachment Blob is not retrievable");
  console.log(`Blob sample check: PASS (${Math.min(new Set(keys).size, 5)} private objects; keys not logged)`);
}

async function validateInsideTransaction(
  request: () => sql.Request,
  tables: TableSchema[],
  sourceCounts: TableCounts,
) {
  for (const table of tables) {
    const count = await request().query(`SELECT COUNT_BIG(*) count FROM ${qualified(config.destinationDatabase, table.name)}`);
    if (Number(count.recordset[0].count) !== sourceCounts[table.name])
      throw new Error(`Pre-commit row count validation failed for ${table.name}`);
    const columns = table.columns.filter((column) => !column.computed && column.type !== "timestamp");
    const list = columns.map((column) => `[${column.name.replace(/]/g, "]]" )}]`).join(",");
    const source = `SELECT ${list} FROM ${qualified(config.sourceDatabase, table.name)}${sourcePredicate(table)}`;
    const destination = `SELECT ${list} FROM ${qualified(config.destinationDatabase, table.name)}`;
    const difference = await request().query(`SELECT CASE WHEN EXISTS(${source} EXCEPT ${destination}) OR EXISTS(${destination} EXCEPT ${source}) THEN 1 ELSE 0 END invalid`);
    if (Number(difference.recordset[0].invalid))
      throw new Error(`Pre-commit value/ID validation failed for ${table.name}`);
  }
  const admin = await request().query(`SELECT COUNT_BIG(*) count FROM ${qualified(config.destinationDatabase, "users")} WHERE [role]='administrator' AND [active]=1`);
  if (Number(admin.recordset[0].count) < 1) throw new Error("No active administrator exists; transaction refused");
  const venue = await request().query(`SELECT COUNT_BIG(*) count FROM ${qualified(config.destinationDatabase, "venues")} WHERE LOWER([name])='village limits' AND ISNULL([is_demo],0)=0`);
  if (Number(venue.recordset[0].count) !== 1) throw new Error("Village Limits venue must exist exactly once");
}

try {
  const [sourceSchema, destinationSchema] = await Promise.all([discover(config.sourceDatabase), discover(config.destinationDatabase)]);
  await validateSchema(sourceSchema.tables, destinationSchema.tables);
  const order = dependencyOrder(destinationSchema.tables.map((table) => table.name), destinationSchema.foreignKeys);
  console.log(`Dependency/insertion order: ${order.join(" -> ")}`);
  const [sourceCounts, destinationBefore] = await Promise.all([
    counts(config.sourceDatabase, sourceSchema.tables, true),
    counts(config.destinationDatabase, destinationSchema.tables),
  ]);
  for (const table of order) console.log(`${table}: source=${sourceCounts[table]} destination-before=${destinationBefore[table]}`);
  if (verifyOnly) {
    await validateData(destinationSchema.tables, sourceCounts);
    await verifyBlobSamples(destinationSchema.tables);
    console.log("Destination verification: PASS");
  } else if (dryRun) {
    if (Object.values(destinationBefore).some(Boolean) && !sameCounts(sourceCounts, destinationBefore)) {
      const bootstrap = await destinationIsBootstrapOnly(query, config.sourceDatabase, config.destinationDatabase, order);
      if (!bootstrap) throw new Error("Destination contains ambiguous or real data; refusing migration");
    }
    await verifyBlobSamples(destinationSchema.tables);
    console.log("Dry run complete: no database changes were made.");
  } else {
    await verifyBlobSamples(destinationSchema.tables);
    const prompt = createInterface({ input: stdin, output: stdout });
    const answer = await prompt.question("Type MIGRATE to write to the destination: ");
    prompt.close();
    if (answer !== "MIGRATE") throw new Error("Confirmation refused; no changes made");
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = () => new sql.Request(transaction);
      const lock = await request().query(`DECLARE @result int; EXEC @result=sp_getapplock @Resource='vl-compliance-staging-data-migration',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=60000; SELECT @result result`);
      if (Number(lock.recordset[0].result) < 0) throw new Error("Could not acquire migration lock");
      const nonEmpty = Object.values(destinationBefore).some(Boolean);
      if (nonEmpty) {
        if (sameCounts(sourceCounts, destinationBefore)) throw new Error("Destination counts already match source; use --verify-only instead of rerunning");
        const bootstrap = await destinationIsBootstrapOnly((text) => request().query(text), config.sourceDatabase, config.destinationDatabase, order);
        if (!bootstrap) throw new Error("Destination contains ambiguous or real data; refusing migration");
      }
      for (const table of [...order].reverse()) await request().batch(`ALTER TABLE ${qualified(config.destinationDatabase, table)} NOCHECK CONSTRAINT ALL; DELETE FROM ${qualified(config.destinationDatabase, table)};`);
      for (const name of order) {
        const table = destinationSchema.tables.find((item) => item.name === name)!;
        const identity = table.columns.some((column) => column.identity);
        if (identity) await request().batch(`SET IDENTITY_INSERT ${qualified(config.destinationDatabase, name)} ON`);
        const inserted = await request().query(copyStatement(config.sourceDatabase, config.destinationDatabase, table));
        if (identity) await request().batch(`SET IDENTITY_INSERT ${qualified(config.destinationDatabase, name)} OFF`);
        console.log(`${name}: inserted=${inserted.rowsAffected[0] || 0} skipped=0`);
      }
      for (const table of order) await request().batch(`ALTER TABLE ${qualified(config.destinationDatabase, table)} WITH CHECK CHECK CONSTRAINT ALL`);
      await validateInsideTransaction(request, destinationSchema.tables, sourceCounts);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
    await validateData(destinationSchema.tables, sourceCounts);
    await verifyBlobSamples(destinationSchema.tables);
    console.log("Migration and validation: PASS");
  }
} finally {
  await pool.close();
}
