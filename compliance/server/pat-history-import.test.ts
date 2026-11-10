import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach,describe,expect,it } from "vitest";
import type { DatabaseAdapter,RunResult } from "./db.js";
import { HISTORIC_PAT_NEXT_DATE,HISTORIC_PAT_ROWS,HISTORIC_PAT_TEST_DATE,importPatHistory } from "./pat-history-import.js";

class TestDatabase implements DatabaseAdapter{
  readonly provider="sqlite" as const;readonly raw=new DatabaseSync(":memory:");
  async get<T>(s:string,p:unknown[]=[]){return this.raw.prepare(s).get(...p as SQLInputValue[]) as T|undefined;}
  async all<T>(s:string,p:unknown[]=[]){return this.raw.prepare(s).all(...p as SQLInputValue[]) as T[];}
  async run(s:string,p:unknown[]=[]):Promise<RunResult>{const r=this.raw.prepare(s).run(...p as SQLInputValue[]);return {lastInsertRowid:Number(r.lastInsertRowid),changes:Number(r.changes)};}
  async exec(s:string){this.raw.exec(s);}async allocateAssetReference(_venueId:number):Promise<string>{throw new Error("not used");}
}
const databases:TestDatabase[]=[];
function fixture(){const db=new TestDatabase();databases.push(db);db.raw.exec(`
CREATE TABLE venues(id INTEGER PRIMARY KEY,name TEXT,is_demo INTEGER DEFAULT 0);
CREATE TABLE locations(id INTEGER PRIMARY KEY,venue_id INTEGER,name TEXT,active INTEGER DEFAULT 1);
CREATE TABLE assets(id INTEGER PRIMARY KEY,barcode TEXT,description TEXT,venue_id INTEGER,location_id INTEGER,pat_status TEXT,status TEXT,notes TEXT,is_demo INTEGER DEFAULT 0,updated_at TEXT);
CREATE TABLE pat_tests(id INTEGER PRIMARY KEY,asset_id INTEGER,result TEXT,test_date TEXT,next_date TEXT,notes TEXT,created_by INTEGER);
CREATE TABLE audit_events(id INTEGER PRIMARY KEY,entity_type TEXT,entity_id INTEGER,action TEXT,before_json TEXT,after_json TEXT,user_id INTEGER,ip_address TEXT);
INSERT INTO venues VALUES(1,'Village Limits',0);
`);for(const name of ["Bar","Annex","Lounge","Restaurant","Main Kitchen","Dessert Room","Breakfast Room","Ladies Toilet","Reception","Corridor"])db.raw.prepare("INSERT INTO locations(venue_id,name) VALUES(1,?)").run(name);return db;}
afterEach(()=>databases.splice(0).forEach(db=>db.raw.close()));

describe("historic PAT import",()=>{
  it("has the complete exact source and PAT facts",()=>{expect(HISTORIC_PAT_ROWS).toHaveLength(134);expect(HISTORIC_PAT_ROWS[0].barcode).toBe("0013");expect(HISTORIC_PAT_ROWS.at(-1)?.barcode).toBe("0146");expect(HISTORIC_PAT_ROWS.some(r=>r.barcode==="0152")).toBe(false);expect(new Set(HISTORIC_PAT_ROWS.map(r=>r.barcode)).size).toBe(134);expect(HISTORIC_PAT_ROWS.every(r=>/^\d{4}$/.test(r.barcode)&&r.testDate===HISTORIC_PAT_TEST_DATE&&r.result==="Pass"&&r.nextDate===HISTORIC_PAT_NEXT_DATE)).toBe(true);});
  it("imports real assets, maps aliases, and leaves ambiguous locations for review",async()=>{const db=fixture(),result=await importPatHistory(db);expect(result).toMatchObject({assetsSupplied:134,newAssets:134,patTestsInserted:134,locationMatches:132});expect(result.unresolvedLocations).toEqual([{barcode:"0030",requested:null},{barcode:"0064",requested:null}]);expect(db.raw.prepare("SELECT barcode,pat_status,is_demo FROM assets WHERE barcode='0013'").get()).toEqual({barcode:"0013",pat_status:"PAT Required",is_demo:0});expect(db.raw.prepare("SELECT l.name FROM assets a JOIN locations l ON l.id=a.location_id WHERE a.barcode='0059'").get()).toEqual({name:"Main Kitchen"});expect(db.raw.prepare("SELECT count(*) n FROM pat_tests WHERE result='Pass' AND test_date='2026-06-01' AND next_date='2027-05-31'").get()).toEqual({n:134});expect(db.raw.prepare("SELECT count(*) n FROM audit_events WHERE action='historical_pat_import' AND user_id IS NULL").get()).toEqual({n:1});});
  it("matches existing assets, skips existing PAT, preserves history and user edits, and is idempotent",async()=>{const db=fixture();db.raw.exec("INSERT INTO assets(id,barcode,description,venue_id,pat_status,status,is_demo) VALUES(50,'0013','Administrator description',1,'PAT Required','Active',0); INSERT INTO pat_tests(id,asset_id,result,test_date,next_date,notes) VALUES(70,50,'Fail','2025-01-01','2026-01-01','Keep me'),(71,50,'Pass','2026-06-01','2027-05-31','Existing historic row')");const first=await importPatHistory(db);expect(first).toMatchObject({newAssets:133,existingAssetsMatched:1,patTestsInserted:133,patTestsAlreadyPresent:1});const second=await importPatHistory(db);expect(second).toMatchObject({newAssets:0,existingAssetsMatched:134,patTestsInserted:0,patTestsAlreadyPresent:134});expect(db.raw.prepare("SELECT description FROM assets WHERE id=50").get()).toEqual({description:"Administrator description"});expect(db.raw.prepare("SELECT result,notes FROM pat_tests WHERE id=70").get()).toEqual({result:"Fail",notes:"Keep me"});expect(db.raw.prepare("SELECT count(*) n FROM assets").get()).toEqual({n:134});expect(db.raw.prepare("SELECT count(*) n FROM pat_tests").get()).toEqual({n:135});});
  it("does no writes in dry-run",async()=>{const db=fixture(),before=db.raw.prepare("SELECT total_changes() n").get() as {n:number};const result=await importPatHistory(db,{dryRun:true});const after=db.raw.prepare("SELECT total_changes() n").get() as {n:number};expect(result).toMatchObject({dryRun:true,newAssets:134,patTestsInserted:0});expect(after.n).toBe(before.n);expect(db.raw.prepare("SELECT count(*) n FROM assets").get()).toEqual({n:0});});
  it("aborts before writes when the venue is not unique",async()=>{const db=fixture();db.raw.exec("INSERT INTO venues VALUES(2,'Village Limits',0)");await expect(importPatHistory(db)).rejects.toThrow("Expected exactly one");expect(db.raw.prepare("SELECT count(*) n FROM assets").get()).toEqual({n:0});});
});
