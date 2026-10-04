import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseAdapter, RunResult } from "./db.js";
import { HISTORIC_FIRE_ALARM_COMPLETED_BY, HISTORIC_FIRE_ALARM_ROWS, importFireAlarmHistory, parseUkLocalDateTime } from "./fire-alarm-history-import.js";

class TestDatabase implements DatabaseAdapter {
  readonly provider = "sqlite" as const;
  readonly raw = new DatabaseSync(":memory:");
  async get<T>(statement:string,params:unknown[]=[]){return this.raw.prepare(statement).get(...params as SQLInputValue[]) as T|undefined;}
  async all<T>(statement:string,params:unknown[]=[]){return this.raw.prepare(statement).all(...params as SQLInputValue[]) as T[];}
  async run(statement:string,params:unknown[]=[]):Promise<RunResult>{const result=this.raw.prepare(statement).run(...params as SQLInputValue[]);return {lastInsertRowid:Number(result.lastInsertRowid),changes:Number(result.changes)};}
  async exec(statement:string){this.raw.exec(statement);}
  async allocateAssetReference(_venueId:number):Promise<string>{throw new Error("not used");}
}

const databases: TestDatabase[] = [];
function fixture(missing?:string) {
  const db = new TestDatabase(); databases.push(db);
  db.raw.exec(`
    CREATE TABLE venues(id INTEGER PRIMARY KEY,name TEXT NOT NULL,is_demo INTEGER DEFAULT 0);
    CREATE TABLE fire_alarm_call_points(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL,code TEXT NOT NULL);
    CREATE TABLE fire_alarm_tests(id INTEGER PRIMARY KEY,venue_id INTEGER NOT NULL,test_datetime TEXT NOT NULL,call_point TEXT,call_point_id INTEGER,result TEXT NOT NULL,faults TEXT,completed_by TEXT,confirmed INTEGER,created_by INTEGER,is_demo INTEGER,alarm_operated INTEGER,sounders_activated INTEGER,panel_indication_correct INTEGER,reset_successful INTEGER,action_id INTEGER);
    CREATE TABLE audit_events(id INTEGER PRIMARY KEY,entity_type TEXT,entity_id INTEGER,action TEXT,before_json TEXT,after_json TEXT,user_id INTEGER,ip_address TEXT);
    INSERT INTO venues(id,name,is_demo) VALUES(1,'Village Limits',0);
  `);
  for (const [index,code] of ["CP01","CP02","CP03","CP04","CP05"].entries()) if(code!==missing)
    db.raw.prepare("INSERT INTO fire_alarm_call_points(id,venue_id,code) VALUES(?,?,?)").run(index+1,1,code);
  return db;
}
afterEach(()=>{for(const db of databases.splice(0))db.raw.close();});

describe("historical fire alarm import",()=>{
  it("parses UK local date/time strictly without timezone movement",()=>{
    expect(parseUkLocalDateTime("06/01/2025 10:45")).toBe("2025-01-06T10:45:00");
    expect(parseUkLocalDateTime("18/08/2026 10:00")).toBe("2026-08-18T10:00:00");
    expect(()=>parseUkLocalDateTime("31/02/2025 10:00")).toThrow("Invalid UK date/time");
  });

  it("contains the complete duplicate-free CP01-CP05 source set",()=>{
    expect(HISTORIC_FIRE_ALARM_ROWS).toHaveLength(85);
    expect(new Set(HISTORIC_FIRE_ALARM_ROWS.map(row=>`${row.testDatetime}|${row.callPointCode}`)).size).toBe(85);
    expect(new Set(HISTORIC_FIRE_ALARM_ROWS.map(row=>row.callPointCode))).toEqual(new Set(["CP01","CP02","CP03","CP04","CP05"]));
  });

  it("imports pass/no-fault rows, maps call points, and leaves unrelated rows untouched",async()=>{
    const db=fixture();
    db.raw.exec("INSERT INTO fire_alarm_tests(id,venue_id,test_datetime,call_point,result,completed_by) VALUES(999,1,'2024-01-01T09:00:00','Legacy','Fail','Existing tester')");
    const result=await importFireAlarmHistory(db);
    expect(result).toEqual({supplied:85,alreadyPresent:0,inserted:85,skipped:0,errors:0,dryRun:false});
    const imported=db.raw.prepare("SELECT * FROM fire_alarm_tests WHERE id<>999 ORDER BY test_datetime").all() as any[];
    expect(imported).toHaveLength(85);
    expect(imported.every(row=>row.result==="Pass"&&row.faults===null&&row.completed_by===HISTORIC_FIRE_ALARM_COMPLETED_BY&&row.confirmed===1&&row.created_by===null&&row.is_demo===0&&row.alarm_operated===1&&row.sounders_activated===1&&row.panel_indication_correct===1&&row.reset_successful===1&&row.action_id===null)).toBe(true);
    expect(imported.every(row=>row.call_point_id===Number(row.call_point.slice(2)))).toBe(true);
    expect(db.raw.prepare("SELECT result,completed_by FROM fire_alarm_tests WHERE id=999").get()).toEqual({result:"Fail",completed_by:"Existing tester"});
    expect(db.raw.prepare("SELECT count(*) count FROM audit_events WHERE action='historical_import'").get()).toEqual({count:1});
  });

  it("skips exact existing matches and is idempotent",async()=>{
    const db=fixture();
    const first=HISTORIC_FIRE_ALARM_ROWS[0];
    db.raw.prepare("INSERT INTO fire_alarm_tests(venue_id,test_datetime,call_point_id,result) VALUES(?,?,?,?)").run(1,first.testDatetime,3,"Pass");
    expect(await importFireAlarmHistory(db)).toMatchObject({alreadyPresent:1,inserted:84,skipped:1});
    expect(await importFireAlarmHistory(db)).toMatchObject({alreadyPresent:85,inserted:0,skipped:85});
    expect(db.raw.prepare("SELECT count(*) count FROM fire_alarm_tests").get()).toEqual({count:85});
  });

  it("performs no writes in dry-run mode",async()=>{
    const db=fixture();
    expect(await importFireAlarmHistory(db,{dryRun:true})).toEqual({supplied:85,alreadyPresent:0,inserted:0,skipped:0,errors:0,dryRun:true});
    expect(db.raw.prepare("SELECT count(*) count FROM fire_alarm_tests").get()).toEqual({count:0});
    expect(db.raw.prepare("SELECT count(*) count FROM audit_events").get()).toEqual({count:0});
  });

  it("aborts before any write when a call point is missing",async()=>{
    const db=fixture("CP04");
    await expect(importFireAlarmHistory(db)).rejects.toThrow("Missing fire alarm call point(s): CP04");
    expect(db.raw.prepare("SELECT count(*) count FROM fire_alarm_tests").get()).toEqual({count:0});
    expect(db.raw.prepare("SELECT count(*) count FROM audit_events").get()).toEqual({count:0});
  });
});
