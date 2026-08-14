import sql from "mssql";

export const EXCLUDED_TABLES = new Set(["schema_migrations"]);
export const STAGING_SOURCE_DATABASE = "vl-compliance-staging-db";
export const STAGING_DESTINATION_DATABASE = "vl-compliance-staging-db-gp";

export type Column = { name: string; type: string; identity: boolean; computed: boolean };
export type ForeignKey = { parent: string; referenced: string };
export type TableSchema = { name: string; columns: Column[] };
export type DatabaseSchema = { tables: TableSchema[]; foreignKeys: ForeignKey[] };
export type MigrationConfig = {
  server: string;
  sourceDatabase: string;
  destinationDatabase: string;
  storageAccount?: string;
  storageContainer?: string;
};
export type TableCounts = Record<string, number>;
export type QueryResult = { recordset?: any[]; rowsAffected?: number[] };
export type Query = (text: string) => Promise<QueryResult>;

export function resolveMigrationConfig(env: NodeJS.ProcessEnv): MigrationConfig {
  return {
    server: env.AZURE_SQL_SERVER || "",
    sourceDatabase: env.SOURCE_AZURE_SQL_DATABASE || STAGING_SOURCE_DATABASE,
    destinationDatabase: env.AZURE_SQL_DATABASE || "",
    storageAccount: env.AZURE_STORAGE_ACCOUNT,
    storageContainer: env.AZURE_STORAGE_CONTAINER || "compliance-private",
  };
}

export const identifier = (value: string) => `[${value.replace(/]/g, "]]" )}]`;
export const localTable = (table: string) => `[dbo].${identifier(table)}`;

export function createReadOnlySourceQuery(execute: Query): Query {
  return async (text) => {
    if (!/^\s*(SELECT|WITH)\b/i.test(text))
      throw new Error("Source connection accepts SELECT queries only");
    if (/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|CREATE|TRUNCATE|EXEC(?:UTE)?)\b/i.test(text))
      throw new Error("Source write or schema SQL is forbidden");
    return execute(text);
  };
}

export async function discoverSchema(query: Query): Promise<DatabaseSchema> {
  const tableResult = await query("SELECT t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='dbo' AND t.is_ms_shipped=0 ORDER BY t.name");
  const names = (tableResult.recordset || []).map((row) => String(row.name)).filter((name) => !EXCLUDED_TABLES.has(name));
  const tables: TableSchema[] = [];
  for (const name of names) {
    const escaped = name.replace(/'/g, "''");
    const result = await query(`SELECT c.name,ty.name [type],CONVERT(bit,c.is_identity) [identity],CONVERT(bit,c.is_computed) [computed] FROM sys.columns c JOIN sys.types ty ON c.user_type_id=ty.user_type_id WHERE c.object_id=OBJECT_ID('dbo.${escaped}') ORDER BY c.column_id`);
    tables.push({ name, columns: (result.recordset || []) as Column[] });
  }
  const fkResult = await query("SELECT pt.name parent,rt.name referenced FROM sys.foreign_keys fk JOIN sys.tables pt ON pt.object_id=fk.parent_object_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id");
  return { tables, foreignKeys: (fkResult.recordset || []) as ForeignKey[] };
}

export async function discoverSeparateSchemas(source: Query, destination: Query) {
  return Promise.all([discoverSchema(source), discoverSchema(destination)]);
}

export function validateMigrationConfig(config: MigrationConfig) {
  const databaseName = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  if (!config.server.trim()) throw new Error("AZURE_SQL_SERVER is required");
  if (!config.sourceDatabase.trim()) throw new Error("SOURCE_AZURE_SQL_DATABASE is required");
  if (!config.destinationDatabase.trim()) throw new Error("AZURE_SQL_DATABASE is required");
  if (!databaseName.test(config.sourceDatabase) || !databaseName.test(config.destinationDatabase))
    throw new Error("Database names contain unsafe or unsupported characters");
  if (config.sourceDatabase.toLowerCase() === config.destinationDatabase.toLowerCase())
    throw new Error("Source and destination databases must be different");
  if (config.destinationDatabase.toLowerCase() !== STAGING_DESTINATION_DATABASE.toLowerCase())
    throw new Error(`AZURE_SQL_DATABASE must be the staging destination ${STAGING_DESTINATION_DATABASE}`);
  if (!/\.database\.windows\.net$/i.test(config.server))
    throw new Error("AZURE_SQL_SERVER must be an Azure SQL logical server hostname");
}

export function dependencyOrder(tables: string[], foreignKeys: ForeignKey[]) {
  const remaining = new Set(tables), ordered: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((table) => foreignKeys.every((fk) => fk.parent !== table || fk.referenced === table || !remaining.has(fk.referenced)));
    if (!ready.length) ready.push([...remaining].sort()[0]!);
    for (const table of ready.sort()) { remaining.delete(table); ordered.push(table); }
  }
  return ordered;
}

export function sourcePredicate(table: TableSchema) {
  return table.columns.some((column) => column.name === "is_demo") ? " WHERE ISNULL([is_demo], 0) = 0" : "";
}
export function sameCounts(source: TableCounts, destination: TableCounts) {
  return Object.keys(source).every((table) => source[table] === destination[table]);
}
export function selectRowsStatement(table: TableSchema) {
  const columns = table.columns.filter((column) => !column.computed && column.type !== "timestamp");
  if (!columns.length) throw new Error(`Table ${table.name} has no copyable columns`);
  return `SELECT ${columns.map((column) => identifier(column.name)).join(",")} FROM ${localTable(table.name)}${sourcePredicate(table)}`;
}
export function insertRowStatement(table: TableSchema, rowIndex = 0) {
  const columns = table.columns.filter((column) => !column.computed && column.type !== "timestamp");
  const names = columns.map((column) => identifier(column.name)).join(",");
  const values = columns.map((_, index) => `@r${rowIndex}c${index}`).join(",");
  return `INSERT INTO ${localTable(table.name)} (${names}) VALUES (${values})`;
}

async function keySet(query: Query, statement: string, fields: string[]) {
  const result = await query(statement);
  return new Set((result.recordset || []).map((row) => fields.map((field) => String(row[field]).toLowerCase()).join("\u0000")));
}

export async function destinationIsBootstrapOnly(source: Query, destination: Query, tables: string[]) {
  const allowed = new Set(["venues", "locations", "risk_assessments", "risk_hazards", "risk_template_registry", "fire_alarm_call_points", "venue_settings"]);
  for (const table of tables) {
    if (allowed.has(table)) continue;
    const result = await destination(`SELECT CASE WHEN EXISTS(SELECT 1 FROM ${localTable(table)}) THEN 1 ELSE 0 END invalid`);
    if (Number(result.recordset?.[0]?.invalid)) return false;
  }
  const checks = [
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${localTable("venues")} WHERE LOWER([name]) <> 'village limits' OR ISNULL([is_demo],0) <> 0) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${localTable("risk_assessments")} WHERE [template_key] IS NULL OR ISNULL([site_verification_required],0) <> 1) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${localTable("fire_alarm_call_points")} WHERE [code] NOT IN ('CP01','CP02','CP03','CP04','CP05')) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${localTable("locations")} l WHERE NOT EXISTS(SELECT 1 FROM ${localTable("venues")} v WHERE v.id=l.venue_id AND LOWER(v.name)='village limits')) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${localTable("risk_hazards")} h WHERE NOT EXISTS(SELECT 1 FROM ${localTable("risk_assessments")} r WHERE r.id=h.assessment_id AND r.template_key IS NOT NULL)) THEN 1 ELSE 0 END invalid`,
  ];
  for (const check of checks) if (Number((await destination(check)).recordset?.[0]?.invalid)) return false;
  const comparisons: Array<[string, string[], string]> = [
    [`SELECT LOWER([name]) [name] FROM ${localTable("venues")} WHERE ISNULL([is_demo],0)=0`, ["name"], "venue"],
    [`SELECT LOWER(v.[name]) venue,LOWER(l.[name]) [name] FROM ${localTable("locations")} l JOIN ${localTable("venues")} v ON v.id=l.venue_id`, ["venue", "name"], "location"],
    [`SELECT LOWER(v.[name]) venue,r.[template_key] [key] FROM ${localTable("risk_assessments")} r JOIN ${localTable("venues")} v ON v.id=r.venue_id WHERE r.template_key IS NOT NULL`, ["venue", "key"], "template"],
    [`SELECT LOWER(v.[name]) venue,c.[code] [code] FROM ${localTable("fire_alarm_call_points")} c JOIN ${localTable("venues")} v ON v.id=c.venue_id`, ["venue", "code"], "call point"],
  ];
  for (const [statement, fields, label] of comparisons) {
    const [sourceKeys, destinationKeys] = await Promise.all([keySet(source, statement, fields), keySet(destination, statement, fields)]);
    for (const key of destinationKeys) if (!sourceKeys.has(key)) throw new Error(`Destination bootstrap ${label} has no source equivalent`);
  }
  return true;
}

export function canonicalRows(rows: any[]) {
  const normalize = (value: any): any => value instanceof Date ? value.toISOString() : Buffer.isBuffer(value) ? value.toString("base64") : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
  return rows.map((row) => JSON.stringify(normalize(row))).sort();
}

export async function rollbackTransaction(transaction: Pick<sql.Transaction, "rollback">) { await transaction.rollback(); }
