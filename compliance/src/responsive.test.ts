import { describe, expect, it } from "vitest";
import app from "./App.tsx?raw";

describe("responsive UI contracts", () => {
  it("keeps the mobile navigation labelled and dismissible", () => {
    expect(app).toContain('aria-controls="primary-navigation"');
    expect(app).toContain("aria-expanded={menu}");
    expect(app).toContain('aria-label="Close navigation"');
    expect(app).toContain('event.key === "Escape"');
  });

  it("provides labels for mobile register cards", () => {
    expect(app).toContain("data-label={f.label}");
    expect(app).toContain('data-label="Evidence"');
    expect(app).toContain('data-label="Last tested"');
  });

  it("keeps the current page title in the mobile application bar", () => {
    expect(app).toContain('className="mobile-page-title"');
    expect(app).toContain("{currentPage}");
  });
});
