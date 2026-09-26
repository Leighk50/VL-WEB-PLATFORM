import "dotenv/config";
import { db } from "./db.js";
import { importPatHistory } from "./pat-history-import.js";

async function main(){const result=await importPatHistory(db,{dryRun:process.argv.includes("--dry-run")});console.log(JSON.stringify(result,null,2));}
main().catch((error:unknown)=>{console.error(`PAT history import failed: ${error instanceof Error?error.message:"Unknown error"}`);process.exitCode=1;});
