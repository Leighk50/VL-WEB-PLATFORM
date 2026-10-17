import type { DatabaseAdapter } from "./db.js";

export const INSERT_FIRE_ALARM_TEST = `INSERT INTO fire_alarm_tests(
  venue_id,test_datetime,call_point_id,zone,alarm_operated,sounders_activated,
  panel_indication_correct,reset_successful,result,faults,notes,completed_by,
  confirmed,created_by
) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

export async function insertFireAlarmTest(
  database: DatabaseAdapter,
  body: Record<string, unknown>,
  user: { id: number; name: string },
) {
  return database.run(INSERT_FIRE_ALARM_TEST, [
    body.venue_id,
    body.test_datetime,
    body.call_point_id,
    body.zone ?? null,
    body.alarm_operated,
    body.sounders_activated ?? null,
    body.panel_indication_correct ?? null,
    body.reset_successful,
    body.result,
    String(body.faults ?? "").trim() || null,
    String(body.notes ?? "").trim() || null,
    user.name,
    1,
    user.id,
  ]);
}
