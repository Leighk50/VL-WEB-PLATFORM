import { describe, expect, it } from "vitest";
import { defaultLanding, moduleAllowed } from "./module-access";

describe("module navigation access", () => {
  it("shows only the authorised module plus shared navigation", () => {
    expect(moduleAllowed("fire", "fire")).toBe(true);
    expect(moduleAllowed("fire", "food")).toBe(false);
    expect(moduleAllowed("food", "fire")).toBe(false);
    expect(moduleAllowed("food", "food")).toBe(true);
    expect(moduleAllowed("both", "fire")).toBe(true);
    expect(moduleAllowed("both", "food")).toBe(true);
    expect(moduleAllowed("food", "shared")).toBe(true);
  });

  it("lands food-only users on Food Hygiene", () => {
    expect(defaultLanding("food")).toBe("/food-hygiene");
    expect(defaultLanding("fire")).toBe("/");
    expect(defaultLanding("both")).toBe("/");
  });
});
