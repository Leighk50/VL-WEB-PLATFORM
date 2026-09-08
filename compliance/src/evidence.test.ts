import { describe, expect, it } from "vitest";
import { evidenceValidationError, isAcceptedEvidence } from "./evidence";

describe("certificate evidence validation", () => {
  it("accepts supported PDF and camera image formats", () => {
    for (const [name, type] of [
      ["certificate.pdf", "application/pdf"],
      ["photo.jpg", "image/jpeg"],
      ["photo.png", "image/png"],
      ["phone.heic", "application/octet-stream"],
      ["phone.heif", ""],
    ])
      expect(isAcceptedEvidence({ name, type })).toBe(true);
  });

  it("reports unsupported types and files over 15 MB", () => {
    expect(
      evidenceValidationError([
        { name: "evidence.txt", type: "text/plain", size: 10 },
      ]),
    ).toMatch(/not a supported/);
    expect(
      evidenceValidationError([
        {
          name: "large.pdf",
          type: "application/pdf",
          size: 15 * 1024 * 1024 + 1,
        },
      ]),
    ).toMatch(/15 MB/);
  });
});
