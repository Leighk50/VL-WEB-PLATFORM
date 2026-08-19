import { describe, expect, it } from "vitest";
import { resolveFireAlarmTestVenue } from "./fire-alarm.js";

describe("fire alarm test venue selection", () => {
  it("uses the selected call point venue rather than an unrelated bootstrap venue", () => {
    const points = [
      { id: 3, venue_id: 10, active: 1 },
      { id: "8", venue_id: "22", active: true },
    ];
    expect(resolveFireAlarmTestVenue(points, 8)).toBe(22);
  });

  it("rejects missing and inactive call points", () => {
    expect(() => resolveFireAlarmTestVenue([{ id: 3, venue_id: 10, active: 0 }], 3)).toThrow("Select a valid active call point");
    expect(() => resolveFireAlarmTestVenue([], 3)).toThrow("Select a valid active call point");
  });
});
