import { describe, expect, it, vi } from "vitest";
import type { DatabaseAdapter } from "./db.js";
import { insertFireAlarmTest, INSERT_FIRE_ALARM_TEST } from "./fire-alarm-tests.js";

describe("Azure-compatible weekly fire alarm insert", () => {
  it("uses an explicit schema-compatible insert and typed null values", async () => {
    const run = vi.fn().mockResolvedValue({ lastInsertRowid: 42, changes: 1 });
    const database = { provider: "azure-sql", run } as unknown as DatabaseAdapter;
    await insertFireAlarmTest(database, {
      venue_id: 1, test_datetime: "2026-08-19T23:10", call_point_id: 3,
      alarm_operated: 1, sounders_activated: 1, panel_indication_correct: 1,
      reset_successful: 1, result: "Pass", faults: "",
    }, { id: 7, name: "Leigh" });
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toBe(INSERT_FIRE_ALARM_TEST);
    expect(run.mock.calls[0][1]).toEqual([
      1,"2026-08-19T23:10",3,null,1,1,1,1,"Pass",null,null,"Leigh",1,7,
    ]);
    expect(INSERT_FIRE_ALARM_TEST).toContain("created_by");
    expect(INSERT_FIRE_ALARM_TEST).toContain("call_point_id");
  });
});
