import sql from "mssql";

export const EXCLUDED_TABLES = new Set(["schema_migrations"]);

export type Column = {
  name: string;
  type: string;
  identity: boolean;
  computed: boolean;
};
export type ForeignKey = { parent: string; referenced: string };
export type TableSchema = { name: string; columns: Column[] };
export type MigrationConfig = {
  server: string;
  sourceDatabase: string;
  destinationDatabase: string;
  storageAccount?: string;
  storageContainer?: string;
};
export type TableCounts = Record<string, number>;
export const STAGING_SOURCE_DATABASE = "vl-compliance-staging-db";
export const STAGING_DESTINATION_DATABASE = "vl-compliance-staging-db-gp";

export function resolveMigrationConfig(
  env: NodeJS.ProcessEnv,
): MigrationConfig {
  return {
    server: env.AZURE_SQL_SERVER || "",
    sourceDatabase:
      env.SOURCE_AZURE_SQL_DATABASE || STAGING_SOURCE_DATABASE,
    destinationDatabase: env.AZURE_SQL_DATABASE || "",
    storageAccount: env.AZURE_STORAGE_ACCOUNT,
    storageContainer:
      env.AZURE_STORAGE_CONTAINER || "compliance-private",
  };
}

const identifier = (value: string) => `[${value.replace(/]/g, "]]" )}]`;
export const qualified = (database: string, table: string) =>
  `${identifier(database)}.[dbo].${identifier(table)}`;

export function validateMigrationConfig(config: MigrationConfig) {
  const databaseName = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  if (!config.server.trim()) throw new Error("AZURE_SQL_SERVER is required");
  if (!config.sourceDatabase.trim())
    throw new Error("SOURCE_AZURE_SQL_DATABASE is required");
  if (!config.destinationDatabase.trim())
    throw new Error("AZURE_SQL_DATABASE is required");
  if (!databaseName.test(config.sourceDatabase) || !databaseName.test(config.destinationDatabase))
    throw new Error("Database names contain unsafe or unsupported characters");
  if (config.sourceDatabase.toLowerCase() === config.destinationDatabase.toLowerCase())
    throw new Error("Source and destination databases must be different");
  if (
    config.destinationDatabase.toLowerCase() !==
    STAGING_DESTINATION_DATABASE.toLowerCase()
  )
    throw new Error(
      `AZURE_SQL_DATABASE must be the staging destination ${STAGING_DESTINATION_DATABASE}`,
    );
  if (!/\.database\.windows\.net$/i.test(config.server))
    throw new Error("AZURE_SQL_SERVER must be an Azure SQL logical server hostname");
}

export function dependencyOrder(tables: string[], foreignKeys: ForeignKey[]) {
  const remaining = new Set(tables);
  const ordered: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((table) =>
      foreignKeys.every((fk) =>
        fk.parent !== table || fk.referenced === table || !remaining.has(fk.referenced),
      ),
    );
    if (!ready.length) {
      // Constraints are disabled and checked after copy, so cycles are safe. Keep this deterministic.
      ready.push([...remaining].sort()[0]!);
    }
    for (const table of ready.sort()) {
      remaining.delete(table);
      ordered.push(table);
    }
  }
  return ordered;
}

export function sourcePredicate(table: TableSchema) {
  return table.columns.some((column) => column.name === "is_demo")
    ? " WHERE ISNULL([is_demo], 0) = 0"
    : "";
}

export function sameCounts(source: TableCounts, destination: TableCounts) {
  return Object.keys(source).every((table) => source[table] === destination[table]);
}

export function copyStatement(
  sourceDatabase: string,
  destinationDatabase: string,
  table: TableSchema,
) {
  const columns = table.columns.filter((column) => !column.computed && column.type !== "timestamp");
  if (!columns.length) throw new Error(`Table ${table.name} has no copyable columns`);
  const list = columns.map((column) => identifier(column.name)).join(",");
  return `INSERT INTO ${qualified(destinationDatabase, table.name)} (${list}) SELECT ${list} FROM ${qualified(sourceDatabase, table.name)}${sourcePredicate(table)};`;
}

export async function destinationIsBootstrapOnly(
  request: (query: string) => Promise<{ recordset?: Array<{ invalid: number }> }>,
  sourceDatabase: string,
  database: string,
  tables: string[],
) {
  const allowed = new Set([
    "venues", "locations", "risk_assessments", "risk_hazards",
    "risk_template_registry", "fire_alarm_call_points", "venue_settings",
  ]);
  for (const table of tables) {
    if (allowed.has(table)) continue;
    const result = await request(`SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, table)}) THEN 1 ELSE 0 END invalid`);
    if (Number(result.recordset?.[0]?.invalid)) return false;
  }
  const checks = [
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "venues")} WHERE LOWER([name]) <> 'village limits' OR ISNULL([is_demo],0) <> 0) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "risk_assessments")} WHERE [template_key] IS NULL OR ISNULL([site_verification_required],0) <> 1) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "fire_alarm_call_points")} WHERE [code] NOT IN ('CP01','CP02','CP03','CP04','CP05')) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "locations")} l WHERE NOT EXISTS(SELECT 1 FROM ${qualified(database, "venues")} v WHERE v.id=l.venue_id AND LOWER(v.name)='village limits')) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "risk_hazards")} h WHERE NOT EXISTS(SELECT 1 FROM ${qualified(database, "risk_assessments")} r WHERE r.id=h.assessment_id AND r.template_key IS NOT NULL)) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "venues")} d WHERE NOT EXISTS(SELECT 1 FROM ${qualified(sourceDatabase, "venues")} s WHERE LOWER(s.name)=LOWER(d.name) AND ISNULL(s.is_demo,0)=0)) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "locations")} d JOIN ${qualified(database, "venues")} dv ON dv.id=d.venue_id WHERE NOT EXISTS(SELECT 1 FROM ${qualified(sourceDatabase, "locations")} s JOIN ${qualified(sourceDatabase, "venues")} sv ON sv.id=s.venue_id WHERE LOWER(s.name)=LOWER(d.name) AND LOWER(sv.name)=LOWER(dv.name) AND ISNULL(sv.is_demo,0)=0)) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "risk_assessments")} d JOIN ${qualified(database, "venues")} dv ON dv.id=d.venue_id WHERE NOT EXISTS(SELECT 1 FROM ${qualified(sourceDatabase, "risk_assessments")} s JOIN ${qualified(sourceDatabase, "venues")} sv ON sv.id=s.venue_id WHERE s.template_key=d.template_key AND LOWER(sv.name)=LOWER(dv.name))) THEN 1 ELSE 0 END invalid`,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ${qualified(database, "fire_alarm_call_points")} d JOIN ${qualified(database, "venues")} dv ON dv.id=d.venue_id WHERE NOT EXISTS(SELECT 1 FROM ${qualified(sourceDatabase, "fire_alarm_call_points")} s JOIN ${qualified(sourceDatabase, "venues")} sv ON sv.id=s.venue_id WHERE s.code=d.code AND LOWER(sv.name)=LOWER(dv.name))) THEN 1 ELSE 0 END invalid`,
  ];
  for (const check of checks) {
    const result = await request(check);
    if (Number(result.recordset?.[0]?.invalid)) return false;
  }
  return true;
}

export async function rollbackTransaction(transaction: Pick<sql.Transaction, "rollback">) {
  await transaction.rollback();
}
