import "dotenv/config";
import { db, migrateDatabase } from "./db.js";
import { importFireAlarmHistory } from "./fire-alarm-history-import.js";

async function main() {
  await migrateDatabase();
  const dryRun = process.argv.includes("--dry-run");
  const result = await importFireAlarmHistory(db, { dryRun });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(`Fire alarm history import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
