import { describe, expect, it, vi } from "vitest";
import {
  cameraErrorMessage,
  stopCamera,
  SUPPORTED_BARCODE_FORMATS,
} from "./barcode-scanner";

describe("mobile barcode scanner support", () => {
  it("requests all required native formats", () => {
    expect(SUPPORTED_BARCODE_FORMATS).toEqual(
      expect.arrayContaining([
        "code_128",
        "code_39",
        "ean_13",
        "ean_8",
        "upc_a",
        "upc_e",
        "qr_code",
      ]),
    );
  });

  it("gives useful camera permission and camera unavailable messages", () => {
    expect(cameraErrorMessage(new DOMException("denied", "NotAllowedError"))).toMatch(/permission was denied/i);
    expect(cameraErrorMessage(new DOMException("missing", "NotFoundError"))).toMatch(/No camera/i);
  });

  it("stops fallback controls and every native media track", () => {
    const stopControl = vi.fn();
    const stopTrack = vi.fn();
    stopCamera(
      { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream,
      { stop: stopControl },
    );
    expect(stopControl).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
