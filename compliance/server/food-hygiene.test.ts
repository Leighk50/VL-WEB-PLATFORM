import { describe, expect, it } from "vitest";
import { coolingState, hotHoldingState, readingIsCompliant, scheduled, villageLimitsFoodLimits } from "./food-hygiene.js";

describe("food hygiene scheduling and configured thresholds", () => {
  it("generates daily work only on configured weekdays", () => {
    expect(scheduled("daily", "2026-08-17", "1,2,3,4,5")).toBe(true);
    expect(scheduled("daily", "2026-08-16", "1,2,3,4,5")).toBe(false);
    expect(scheduled("weekly", "2026-08-17")).toBe(true);
    expect(scheduled("monthly", "2026-08-01")).toBe(true);
    expect(scheduled("as-needed", "2026-08-17")).toBe(false);
  });

  it("uses the Village Limits cold-storage and core-temperature boundaries", () => {
    expect(readingIsCompliant(0, 0, 8)).toBe(true);
    expect(readingIsCompliant(8, 0, 8)).toBe(true);
    expect(readingIsCompliant(8.1, 0, 8)).toBe(false);
    expect(readingIsCompliant(-18, null, -18)).toBe(true);
    expect(readingIsCompliant(-17.9, null, -18)).toBe(false);
    expect(readingIsCompliant(72, 72, null)).toBe(true);
    expect(readingIsCompliant(71.9, 72, null)).toBe(false);
    expect(villageLimitsFoodLimits.map(([key])=>key)).toContain("probe-boiling");
  });

  it("enforces cooling below 8 degrees within 120 minutes", () => {
    const start="2026-08-19T10:00:00.000Z";
    expect(coolingState(start,7.9,"2026-08-19T12:00:00.000Z")).toMatchObject({compliant:true,failed:false,elapsedMinutes:120});
    expect(coolingState(start,8,"2026-08-19T12:00:00.000Z")).toMatchObject({compliant:false,failed:true});
    expect(coolingState(start,7,"2026-08-19T12:01:00.000Z").compliant).toBe(false);
  });

  it("enforces optional hot holding at 65 degrees for no more than 120 minutes", () => {
    const start="2026-08-19T10:00:00.000Z";
    expect(hotHoldingState(start,65,"2026-08-19T12:00:00.000Z").compliant).toBe(true);
    expect(hotHoldingState(start,64.9,"2026-08-19T11:00:00.000Z").failed).toBe(true);
    expect(hotHoldingState(start,70,"2026-08-19T12:01:00.000Z").failed).toBe(true);
  });

  it("uses configured inclusive limits without inventing defaults", () => {
    expect(readingIsCompliant(3.5, 1, 5)).toBe(true);
    expect(readingIsCompliant(5, 1, 5)).toBe(true);
    expect(readingIsCompliant(5.1, 1, 5)).toBe(false);
    expect(readingIsCompliant(-18, null, -18)).toBe(true);
    expect(readingIsCompliant(99, null, null)).toBe(true);
  });
});
