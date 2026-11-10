import { describe,expect,it } from "vitest";
import { formatPatDate,formatPatDueDate } from "./pat-display";

describe("PAT history display",()=>{
  it("shows the historic test date without timezone movement",()=>expect(formatPatDate("2026-06-01")).toBe("1 June 2026"));
  it("shows an exact stored due date as its user-facing due month",()=>expect(formatPatDueDate("2027-05-31")).toBe("May 2027"));
  it("labels absent dates clearly",()=>{expect(formatPatDate(null)).toBe("not recorded");expect(formatPatDueDate(undefined)).toBe("not set");});
});
