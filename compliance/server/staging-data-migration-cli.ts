import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import sql from "mssql";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  canonicalRows,
  classifyDestination,
  createReadOnlySourceQuery,
  dependencyOrder,
  destinationIsBootstrapOnly,
  discoverSeparateSchemas,
  identifier,
  insertRowStatement,
  isPreservableFailedLoginAuditRow,
  localTable,
  resolveMigrationConfig,
  selectRowsStatement,
  sourcePredicate,
  validateMigrationConfig,
  type Query,
  type TableCounts,
  type TableSchema,
} from "./staging-data-migration.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run"), verifyOnly = args.has("--verify-only");
for (const arg of args) if (!["--dry-run", "--verify-only"].includes(arg)) throw new Error(`Unknown argument: ${arg}`);
if (dryRun && verifyOnly) throw new Error("Choose either --dry-run or --verify-only");

const config = resolveMigrationConfig(process.env);
validateMigrationConfig(config);
console.log("Compliance Hub one-time data migration");
console.log(`Source (SELECT only): ${config.server} / ${config.sourceDatabase}`);
console.log(`Destination:          ${config.server} / ${config.destinationDatabase}`);
console.log(`Mode:                 ${verifyOnly ? "VERIFY ONLY" : dryRun ? "DRY RUN" : "WRITE"}`);

const credential = new DefaultAzureCredential();
const token = await credential.getToken("https://database.windows.net/.default");
if (!token) throw new Error("Managed identity could not obtain an Azure SQL token");
const connectionConfig = (database: string, readOnlyIntent: boolean): sql.config => ({
  server: config.server,
  database,
  options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true, readOnlyIntent },
  authentication: { type: "azure-active-directory-access-token", options: { token: token.token } },
  pool: { min: 0, max: 4, idleTimeoutMillis: 30_000 },
  connectionTimeout: 30_000,
  requestTimeout: 300_000,
});
const [sourcePool, destinationPool] = await Promise.all([
  new sql.ConnectionPool(connectionConfig(config.sourceDatabase, true)).connect(),
  new sql.ConnectionPool(connectionConfig(config.destinationDatabase, false)).connect(),
]);
const sourceQuery = createReadOnlySourceQuery((text) => sourcePool.request().query(text));
const destinationQuery: Query = (text) => destinationPool.request().query(text);

async function counts(query: Query, tables: TableSchema[], source = false) {
  const result: TableCounts = {};
  for (const table of tables) {
    const row = await query(`SELECT COUNT_BIG(*) count FROM ${localTable(table.name)}${source ? sourcePredicate(table) : ""}`);
    result[table.name] = Number(row.recordset?.[0]?.count);
  }
  return result;
}

function validateSchema(source: TableSchema[], destination: TableSchema[]) {
  const sourceByName = new Map(source.map((table) => [table.name, table]));
  for (const table of destination) {
    const sourceTable = sourceByName.get(table.name);
    if (!sourceTable) throw new Error(`Source is missing destination application table ${table.name}`);
    const sourceColumns = new Map(sourceTable.columns.map((column) => [column.name, column]));
    for (const column of table.columns.filter((item) => !item.computed && item.type !== "timestamp")) {
      const sourceColumn = sourceColumns.get(column.name);
      if (!sourceColumn || sourceColumn.type !== column.type) throw new Error(`Schema mismatch at ${table.name}.${column.name}`);
    }
  }
  const destinationNames = new Set(destination.map((table) => table.name));
  for (const table of source) if (!destinationNames.has(table.name)) throw new Error(`Destination is missing source application table ${table.name}`);
}

async function tableRows(query: Query, table: TableSchema, source = false) {
  if (source) return (await query(selectRowsStatement(table))).recordset || [];
  const destinationStatement = `SELECT ${table.columns.filter((column) => !column.computed && column.type !== "timestamp").map((column) => identifier(column.name)).join(",")} FROM ${localTable(table.name)}`;
  return (await query(destinationStatement)).recordset || [];
}

async function compareDatabases(tables: TableSchema[]) {
  const additionalRows: Record<string, any[]> = {};
  for (const table of tables) {
    const [sourceRows, destinationRows] = await Promise.all([tableRows(sourceQuery, table, true), tableRows(destinationQuery, table)]);
    if (table.name === "audit_events") {
      const sourceIds = new Set(sourceRows.map((row) => String(row.id)));
      const sourceIdRows = destinationRows.filter((row) => sourceIds.has(String(row.id)));
      const extras = destinationRows.filter((row) => !sourceIds.has(String(row.id)));
      if (
        JSON.stringify(canonicalRows(sourceRows)) !==
          JSON.stringify(canonicalRows(sourceIdRows)) ||
        !extras.every(isPreservableFailedLoginAuditRow)
      )
        return { complete: false, additionalRows: {} };
      additionalRows.audit_events = extras;
      continue;
    }
    if (JSON.stringify(canonicalRows(sourceRows)) !== JSON.stringify(canonicalRows(destinationRows)))
      return { complete: false, additionalRows: {} };
  }
  return { complete: true, additionalRows };
}

async function validateData(
  tables: TableSchema[],
  sourceCounts: TableCounts,
  destination: Query = destinationQuery,
  additionalRows: Record<string, any[]> = {},
) {
  const destinationCounts = await counts(destination, tables);
  for (const table of tables) {
    const expectedCount = sourceCounts[table.name] + (additionalRows[table.name]?.length || 0);
    const ok = expectedCount === destinationCounts[table.name];
    console.log(`${table.name}: source=${sourceCounts[table.name]} preserved=${additionalRows[table.name]?.length || 0} destination=${destinationCounts[table.name]} validation=${ok ? "PASS" : "FAIL"}`);
    if (!ok) throw new Error(`Row count validation failed for ${table.name}`);
    const [sourceRows, destinationRows] = await Promise.all([tableRows(sourceQuery, table, true), tableRows(destination, table)]);
    const expectedRows = [...sourceRows, ...(additionalRows[table.name] || [])];
    if (JSON.stringify(canonicalRows(expectedRows)) !== JSON.stringify(canonicalRows(destinationRows))) throw new Error(`Value/ID validation failed for ${table.name}`);
  }
  const constraints = await destination("DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS");
  if (constraints.recordset?.length) throw new Error("Destination foreign-key/check-constraint validation failed");
  const admin = await destination(`SELECT COUNT_BIG(*) count FROM ${localTable("users")} WHERE [role]='administrator' AND [active]=1`);
  if (Number(admin.recordset?.[0]?.count) < 1) throw new Error("No active administrator exists in the migrated destination");
  const venue = await destination(`SELECT COUNT_BIG(*) count FROM ${localTable("venues")} WHERE LOWER([name])='village limits' AND ISNULL([is_demo],0)=0`);
  if (Number(venue.recordset?.[0]?.count) !== 1) throw new Error("Village Limits venue does not exist exactly once");
}

async function verifyBlobSamples(tables: TableSchema[]) {
  if (!config.storageAccount) { console.log("Blob sample check: SKIPPED (AZURE_STORAGE_ACCOUNT not set)"); return; }
  const keys: string[] = [];
  for (const table of tables.filter((item) => ["document_attachments", "documents", "photos"].includes(item.name) && item.columns.some((column) => column.name === "storage_key"))) {
    const rows = await sourceQuery(`SELECT TOP (3) [storage_key] FROM ${localTable(table.name)} WHERE [storage_key] IS NOT NULL ORDER BY NEWID()`);
    keys.push(...(rows.recordset || []).map((row) => String(row.storage_key)));
  }
  const container = new BlobServiceClient(`https://${config.storageAccount}.blob.core.windows.net`, credential).getContainerClient(config.storageContainer!);
  for (const key of [...new Set(keys)].slice(0, 5)) if (!(await container.getBlobClient(key).exists())) throw new Error("A sampled private attachment Blob is not retrievable");
  console.log(`Blob sample check: PASS (${Math.min(new Set(keys).size, 5)} private objects; keys not logged)`);
}

async function insertRows(request: () => sql.Request, table: TableSchema, rows: any[]) {
  const columns = table.columns.filter((column) => !column.computed && column.type !== "timestamp");
  for (const row of rows) {
    const operation = request();
    columns.forEach((column, index) => operation.input(`r0c${index}`, row[column.name] === undefined ? null : row[column.name]));
    await operation.query(insertRowStatement(table));
  }
}

async function reinsertPreservedAuditRows(
  request: () => sql.Request,
  table: TableSchema,
  rows: any[],
) {
  const columns = table.columns.filter(
    (column) => !column.identity && !column.computed && column.type !== "timestamp",
  );
  const restored: any[] = [];
  for (const row of rows) {
    const operation = request();
    columns.forEach((column, index) =>
      operation.input(`p${index}`, row[column.name] === undefined ? null : row[column.name]),
    );
    const result = await operation.query(
      `INSERT INTO ${localTable(table.name)} (${columns.map((column) => identifier(column.name)).join(",")}) OUTPUT INSERTED.[id] VALUES (${columns.map((_, index) => `@p${index}`).join(",")})`,
    );
    restored.push({ ...row, id: result.recordset?.[0]?.id });
  }
  return restored;
}

try {
  const [sourceSchema, destinationSchema] = await discoverSeparateSchemas(sourceQuery, destinationQuery);
  validateSchema(sourceSchema.tables, destinationSchema.tables);
  const order = dependencyOrder(destinationSchema.tables.map((table) => table.name), destinationSchema.foreignKeys);
  console.log(`Dependency/insertion order: ${order.join(" -> ")}`);
  const [sourceCounts, destinationBefore] = await Promise.all([counts(sourceQuery, sourceSchema.tables, true), counts(destinationQuery, destinationSchema.tables)]);
  for (const table of order) console.log(`${table}: source=${sourceCounts[table]} destination-before=${destinationBefore[table]}`);
  const destinationHasRows = Object.values(destinationBefore).some(Boolean);
  const comparison = destinationHasRows
    ? await compareDatabases(destinationSchema.tables)
    : { complete: false, additionalRows: {} };
  const alreadyComplete = comparison.complete;
  const classification = await classifyDestination(
    sourceQuery,
    destinationQuery,
    order,
    destinationBefore,
    alreadyComplete,
  );
  console.log(`Destination classification: ${classification.classification}`);
  for (const reason of classification.reasons) console.log(`  - ${reason}`);
  if (verifyOnly) {
    await validateData(
      destinationSchema.tables,
      sourceCounts,
      destinationQuery,
      comparison.additionalRows,
    );
    await verifyBlobSamples(destinationSchema.tables);
    console.log("Destination verification: PASS");
  } else if (dryRun) {
    if (["REAL_DATA", "AMBIGUOUS"].includes(classification.classification) && !alreadyComplete)
      throw new Error(`Destination classified ${classification.classification}; refusing migration`);
    await verifyBlobSamples(destinationSchema.tables);
    console.log(`Dry run complete: no database changes were made.${alreadyComplete ? " Destination already matches source." : ""}`);
  } else {
    await verifyBlobSamples(destinationSchema.tables);
    const prompt = createInterface({ input: stdin, output: stdout });
    const answer = await prompt.question("Type MIGRATE to write to the destination: ");
    prompt.close();
    if (answer !== "MIGRATE") throw new Error("Confirmation refused; no changes made");
    if (alreadyComplete) throw new Error("Destination already matches source; use --verify-only instead of rerunning");
    const transaction = new sql.Transaction(destinationPool);
    let restoredFailedLogins: any[] = [];
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const request = () => new sql.Request(transaction);
      const destinationTransactionQuery: Query = (text) => request().query(text);
      const lock = await destinationTransactionQuery("DECLARE @result int; EXEC @result=sp_getapplock @Resource='vl-compliance-staging-data-migration',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=60000; SELECT @result result");
      if (Number(lock.recordset?.[0]?.result) < 0) throw new Error("Could not acquire migration lock");
      if (destinationHasRows && !(await destinationIsBootstrapOnly(sourceQuery, destinationTransactionQuery, order))) throw new Error("Destination contains ambiguous or real data; refusing migration");
      const auditTable = destinationSchema.tables.find((table) => table.name === "audit_events")!;
      const preservedFailedLogins = destinationBefore.audit_events
        ? await tableRows(destinationTransactionQuery, auditTable)
        : [];
      if (!preservedFailedLogins.every(isPreservableFailedLoginAuditRow))
        throw new Error("Destination audit residue changed or is not safely preservable");
      for (const table of [...order].reverse()) await request().batch(`ALTER TABLE ${localTable(table)} NOCHECK CONSTRAINT ALL; DELETE FROM ${localTable(table)};`);
      for (const name of order) {
        const table = destinationSchema.tables.find((item) => item.name === name)!;
        const rows = await tableRows(sourceQuery, table, true);
        const identity = table.columns.some((column) => column.identity);
        if (identity) await request().batch(`SET IDENTITY_INSERT ${localTable(name)} ON`);
        await insertRows(request, table, rows);
        if (identity) await request().batch(`SET IDENTITY_INSERT ${localTable(name)} OFF`);
        console.log(`${name}: inserted=${rows.length} skipped=0`);
      }
      restoredFailedLogins = await reinsertPreservedAuditRows(
        request,
        auditTable,
        preservedFailedLogins,
      );
      if (restoredFailedLogins.length)
        console.log(`audit_events: preserved=${restoredFailedLogins.length} pre-migration failed-login row(s) with new IDs`);
      for (const table of order) await request().batch(`ALTER TABLE ${localTable(table)} WITH CHECK CHECK CONSTRAINT ALL`);
      await validateData(destinationSchema.tables, sourceCounts, destinationTransactionQuery, { audit_events: restoredFailedLogins });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
    await validateData(destinationSchema.tables, sourceCounts, destinationQuery, { audit_events: restoredFailedLogins });
    await verifyBlobSamples(destinationSchema.tables);
    console.log("Migration and validation: PASS");
  }
} finally {
  await Promise.all([sourcePool.close(), destinationPool.close()]);
}
