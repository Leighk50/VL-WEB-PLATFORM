import { describe, expect, it } from "vitest";
import {
  addTwelveMonths,
  approvalDateChanged,
  assessmentDateChanged,
  initialConfirmationDates,
  isoAssessmentDate,
  nextReviewDateChanged,
} from "./risk-confirmation";

describe("assessment confirmation dates", () => {
  it("keeps browser date-input ISO values unambiguous", () => {
    expect(isoAssessmentDate("2026-06-01")).toBe("2026-06-01");
  });

  it("normalises a UK-displayed date when supplied", () => {
    expect(isoAssessmentDate("01/06/2026")).toBe("2026-06-01");
    expect(isoAssessmentDate("11/08/2026")).toBe("2026-08-11");
  });

  it("defaults approval to assessment date and review to twelve months later", () => {
    expect(initialConfirmationDates("2026-08-11")).toMatchObject({
      assessmentDate: "2026-08-11",
      approvalDate: "2026-08-11",
      nextReviewDate: "2027-08-11",
    });
  });

  it("recalculates the next review when assessment or approval changes", () => {
    const initial = initialConfirmationDates("2026-08-11");
    expect(assessmentDateChanged(initial, "2026-09-20")).toMatchObject({
      approvalDate: "2026-09-20",
      nextReviewDate: "2027-09-20",
    });
    expect(approvalDateChanged(initial, "2026-10-05")).toMatchObject({
      approvalDate: "2026-10-05",
      nextReviewDate: "2027-10-05",
    });
  });

  it("clamps leap-day and end-of-month dates without timezone shifts", () => {
    expect(addTwelveMonths("2024-02-29")).toBe("2025-02-28");
    expect(addTwelveMonths("2027-02-28")).toBe("2028-02-28");
    expect(addTwelveMonths("2026-01-31")).toBe("2027-01-31");
  });

  it("keeps a manually overridden review date until approval deliberately changes", () => {
    const overridden = nextReviewDateChanged(
      initialConfirmationDates("2026-08-11"),
      "2028-01-15",
    );
    expect(overridden.nextReviewDate).toBe("2028-01-15");
    expect(overridden.nextReviewManuallySet).toBe(true);
    expect({ ...overridden, assessmentDate: overridden.assessmentDate }).toMatchObject({
      nextReviewDate: "2028-01-15",
    });
    expect(approvalDateChanged(overridden, "2026-09-01")).toMatchObject({
      nextReviewDate: "2027-09-01",
      nextReviewManuallySet: false,
    });
  });
});
