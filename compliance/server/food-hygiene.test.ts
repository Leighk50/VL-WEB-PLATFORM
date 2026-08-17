import { describe, expect, it } from "vitest";
import { readingIsCompliant, scheduled } from "./food-hygiene.js";

describe("food hygiene scheduling and configured thresholds", () => {
  it("generates daily work only on configured weekdays", () => {
    expect(scheduled("daily", "2026-08-17", "1,2,3,4,5")).toBe(true);
    expect(scheduled("daily", "2026-08-16", "1,2,3,4,5")).toBe(false);
    expect(scheduled("weekly", "2026-08-17")).toBe(true);
    expect(scheduled("monthly", "2026-08-01")).toBe(true);
    expect(scheduled("as-needed", "2026-08-17")).toBe(false);
  });

  it("uses configured inclusive limits without inventing defaults", () => {
    expect(readingIsCompliant(3.5, 1, 5)).toBe(true);
    expect(readingIsCompliant(5, 1, 5)).toBe(true);
    expect(readingIsCompliant(5.1, 1, 5)).toBe(false);
    expect(readingIsCompliant(-18, null, -18)).toBe(true);
    expect(readingIsCompliant(99, null, null)).toBe(true);
  });
});
