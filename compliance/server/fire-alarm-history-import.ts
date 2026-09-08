import type { DatabaseAdapter } from "./db.js";

export const HISTORIC_FIRE_ALARM_COMPLETED_BY = "Historic fire alarm log import";

const source = `06/01/2025 10:45|CP03
13/01/2025 11:35|CP04
20/01/2025 12:25|CP05
27/01/2025 13:15|CP01
03/02/2025 14:05|CP02
10/02/2025 14:55|CP03
17/02/2025 15:45|CP04
24/02/2025 16:35|CP05
03/03/2025 17:25|CP01
10/03/2025 15:01|CP02
17/03/2025 12:37|CP03
24/03/2025 10:13|CP04
31/03/2025 07:49|CP05
07/04/2025 08:17|CP01
14/04/2025 08:46|CP02
21/04/2025 09:15|CP03
28/04/2025 09:44|CP04
05/05/2025 10:27|CP05
12/05/2025 11:10|CP01
19/05/2025 11:53|CP02
26/05/2025 12:51|CP03
02/06/2025 13:49|CP04
09/06/2025 14:46|CP05
16/06/2025 15:44|CP01
23/06/2025 12:37|CP02
30/06/2025 09:29|CP03
07/07/2025 06:22|CP04
14/07/2025 07:05|CP05
21/07/2025 09:29|CP01
28/07/2025 11:53|CP02
04/08/2025 14:17|CP03
11/08/2025 17:12|CP04
18/08/2025 12:24|CP05
25/08/2025 12:10|CP01
01/09/2025 14:34|CP02
08/09/2025 17:12|CP03
15/09/2025 19:53|CP04
22/09/2025 22:37|CP05
30/09/2025 01:24|CP01
07/10/2025 04:14|CP02
14/10/2025 07:07|CP03
21/10/2025 10:03|CP04
28/10/2025 13:01|CP05
04/11/2025 16:03|CP01
11/11/2025 19:07|CP02
18/11/2025 18:38|CP03
25/11/2025 13:50|CP04
02/12/2025 14:05|CP05
09/12/2025 14:19|CP01
16/12/2025 14:34|CP02
23/12/2025 14:48|CP03
30/12/2025 15:02|CP04
06/01/2026 15:17|CP05
13/01/2026 15:31|CP01
20/01/2026 15:46|CP02
27/01/2026 16:00|CP03
03/02/2026 16:14|CP04
10/02/2026 16:29|CP05
17/02/2026 16:43|CP01
24/02/2026 16:58|CP02
03/03/2026 09:46|CP03
10/03/2026 10:29|CP04
17/03/2026 11:12|CP05
24/03/2026 11:55|CP01
31/03/2026 12:38|CP02
07/04/2026 13:22|CP03
14/04/2026 14:05|CP04
21/04/2026 15:18|CP05
28/04/2026 17:02|CP01
05/05/2026 19:17|CP02
12/05/2026 22:02|CP03
19/05/2026 10:02|CP04
26/05/2026 10:17|CP05
02/06/2026 10:31|CP01
09/06/2026 10:45|CP02
16/06/2026 11:00|CP03
23/06/2026 11:44|CP04
30/06/2026 13:00|CP05
07/07/2026 14:45|CP01
14/07/2026 17:01|CP02
21/07/2026 14:37|CP03
28/07/2026 12:43|CP04
04/08/2026 11:19|CP05
11/08/2026 10:24|CP01
18/08/2026 10:00|CP02`;

export type HistoricFireAlarmRow = { testDatetime: string; callPointCode: string };
export type FireAlarmImportSummary = { supplied: number; alreadyPresent: number; inserted: number; skipped: number; errors: number; dryRun: boolean };

export function parseUkLocalDateTime(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid UK date/time: ${value}`);
  const [, dd, mm, yyyy, hh, minute] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(minute)));
  if (date.getUTCFullYear() !== Number(yyyy) || date.getUTCMonth() !== Number(mm) - 1 || date.getUTCDate() !== Number(dd) || Number(hh) > 23 || Number(minute) > 59)
    throw new Error(`Invalid UK date/time: ${value}`);
  return `${yyyy}-${mm}-${dd}T${hh}:${minute}:00`;
}

export const HISTORIC_FIRE_ALARM_ROWS: readonly HistoricFireAlarmRow[] = source.split("\n").map(line => {
  const [dateTime, callPointCode] = line.split("|");
  return { testDatetime: parseUkLocalDateTime(dateTime), callPointCode };
});

export async function importFireAlarmHistory(database: DatabaseAdapter, options: { dryRun?: boolean } = {}): Promise<FireAlarmImportSummary> {
  const dryRun = Boolean(options.dryRun);
  const duplicates = new Set<string>();
  for (const row of HISTORIC_FIRE_ALARM_ROWS) {
    const key = `${row.testDatetime}|${row.callPointCode}`;
    if (duplicates.has(key)) throw new Error(`Duplicate source row: ${key}`);
    duplicates.add(key);
  }
  const venues = await database.all<{ id: number }>("SELECT id FROM venues WHERE lower(name)=lower(?) AND is_demo=0", ["Village Limits"]);
  if (venues.length !== 1) throw new Error(`Expected exactly one non-demo Village Limits venue; found ${venues.length}`);
  const venueId = Number(venues[0].id);
  const points = await database.all<{ id: number; code: string }>("SELECT id,code FROM fire_alarm_call_points WHERE venue_id=? AND code IN ('CP01','CP02','CP03','CP04','CP05')", [venueId]);
  const pointByCode = new Map(points.map(point => [point.code, Number(point.id)]));
  const missing = ["CP01", "CP02", "CP03", "CP04", "CP05"].filter(code => !pointByCode.has(code));
  if (missing.length) throw new Error(`Missing fire alarm call point(s): ${missing.join(", ")}`);

  const pending: Array<HistoricFireAlarmRow & { callPointId: number }> = [];
  let alreadyPresent = 0;
  for (const row of HISTORIC_FIRE_ALARM_ROWS) {
    const callPointId = pointByCode.get(row.callPointCode)!;
    const existing = await database.get("SELECT id FROM fire_alarm_tests WHERE venue_id=? AND test_datetime=? AND call_point_id=?", [venueId, row.testDatetime, callPointId]);
    if (existing) alreadyPresent += 1;
    else pending.push({ ...row, callPointId });
  }
  if (!dryRun) {
    for (const row of pending)
      await database.run("INSERT INTO fire_alarm_tests(venue_id,test_datetime,call_point,call_point_id,result,faults,completed_by,confirmed,created_by,is_demo,alarm_operated,sounders_activated,panel_indication_correct,reset_successful,action_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [venueId,row.testDatetime,row.callPointCode,row.callPointId,"Pass",null,HISTORIC_FIRE_ALARM_COMPLETED_BY,1,null,0,1,1,1,1,null]);
    await database.run("INSERT INTO audit_events(entity_type,entity_id,action,before_json,after_json,user_id,ip_address) VALUES(?,?,?,?,?,?,?)", ["fire_alarm_tests",null,"historical_import",null,JSON.stringify({ supplied:HISTORIC_FIRE_ALARM_ROWS.length,inserted:pending.length,skipped:alreadyPresent }),null,null]);
  }
  return { supplied:HISTORIC_FIRE_ALARM_ROWS.length,alreadyPresent,inserted:dryRun ? 0 : pending.length,skipped:alreadyPresent,errors:0,dryRun };
}
