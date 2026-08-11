import { describe, expect, it } from "vitest";
import {
  filterAssessments,
  riskDetailPath,
  riskListPath,
} from "./risk-navigation";

const records = [
  { id: 1, category: "General", area: "Kitchen" },
  { id: 2, category: "Fire Safety", area: "Kitchen" },
  { id: 3, category: "General", area: "External" },
];

describe("risk assessment navigation and filtering", () => {
  it("filters by the actual category or area field", () => {
    expect(filterAssessments(records, "Fire Safety").map((item) => item.id)).toEqual([2]);
    expect(filterAssessments(records, "Kitchen").map((item) => item.id)).toEqual([1, 2]);
  });

  it("restores the complete list with All", () => {
    expect(filterAssessments(records, "All")).toHaveLength(3);
  });

  it("preserves the filter in list and direct-detail URLs", () => {
    expect(riskListPath("Kitchen")).toBe("/risk?category=Kitchen");
    expect(riskDetailPath(42, "Bar/Cellar")).toBe(
      "/risk/42?category=Bar%2FCellar",
    );
  });
});
