import { describe, expect, it } from "vitest";
import {
  clampPdfPage,
  clampPdfZoom,
  sanitizePdfPreviewError,
} from "./pdf-preview";

describe("PDF evidence viewer state", () => {
  it("keeps page navigation and zoom within supported bounds", () => {
    expect(clampPdfPage(0, 5)).toBe(1);
    expect(clampPdfPage(6, 5)).toBe(5);
    expect(clampPdfPage(3, 5)).toBe(3);
    expect(clampPdfZoom(0.1)).toBe(0.5);
    expect(clampPdfZoom(3)).toBe(2.5);
  });

  it("retains useful PDF errors while removing URLs and bearer values", () => {
    expect(
      sanitizePdfPreviewError(
        new Error(
          "Invalid PDF at https://secret.example/file Bearer sensitive-token",
        ),
      ),
    ).toBe("Invalid PDF at [redacted URL] Bearer [redacted]");
  });
});
