import "dotenv/config";
import { db, migrateDatabase } from "./db.js";

await migrateDatabase();
console.log(`Compliance database migrations complete (${db.provider}).`);
