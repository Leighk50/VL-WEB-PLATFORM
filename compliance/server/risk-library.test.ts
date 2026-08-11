import { describe, expect, it } from "vitest";
import { riskLevel, riskScore, riskTemplates } from "./risk-library.js";

describe("risk assessment library", () => {
  it("uses the documented 1-5 likelihood by 1-5 severity matrix", () => {
    expect(riskScore(1, 1)).toBe(1);
    expect(riskScore(5, 5)).toBe(25);
    expect(riskLevel(4)).toBe("Low");
    expect(riskLevel(5)).toBe("Medium");
    expect(riskLevel(10)).toBe("High");
    expect(riskLevel(15)).toBe("Critical");
  });

  it("contains the complete non-empty Village Limits template library", () => {
    expect(riskTemplates).toHaveLength(37);
    expect(new Set(riskTemplates.map((item) => item.key)).size).toBe(37);
    expect(riskTemplates.filter((item) => item.category === "General")).toHaveLength(12);
    expect(riskTemplates.filter((item) => item.category === "Fire Safety")).toHaveLength(25);
    expect(riskTemplates.every((item) => item.hazards.length >= 4)).toBe(true);
    expect(riskTemplates.find((item) => item.title.startsWith("Deep Fat"))?.hazards.join(" ")).toMatch(/thermostat|oil|suppression/i);
  });
});
