import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  ApiError,
  createEvidenceObjectUrl,
  downloadPrivateAttachment,
  evidencePreviewKind,
  fetchPrivateAttachment,
} from "./api";

describe("authenticated attachment retrieval", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches protected content with the bearer token and preserves metadata", async () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "compliance_token" ? "saved-session-token" : null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["pdf-content"], { type: "application/pdf" }), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="certificate.pdf"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPrivateAttachment(42);

    expect(result.contentType).toBe("application/pdf");
    expect(result.filename).toBe("certificate.pdf");
    expect(await result.blob.text()).toBe("pdf-content");
    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get("Authorization")).toBe(
      "Bearer saved-session-token",
    );
  });

  it("rejects an unauthorized attachment response", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(fetchPrivateAttachment(42)).rejects.toThrow(
      "Evidence file could not be loaded",
    );
  });

  it("classifies PDF, image and unavailable viewer states", () => {
    expect(evidencePreviewKind("application/pdf")).toBe("pdf");
    expect(evidencePreviewKind("image/jpeg")).toBe("image");
    expect(evidencePreviewKind("image/heic")).toBe("image");
    expect(evidencePreviewKind("application/octet-stream")).toBe("unavailable");
  });

  it("preserves safe validation/server error metadata", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "token" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Invalid assessment confirmation",
      code: "VALIDATION_FAILED",
      issues: { fieldErrors: { assessment_date: ["Invalid"] } },
    }), { status: 400, headers: { "Content-Type": "application/json" } })));
    const caught = await api("/risk-assessments/1/review", { method: "POST", body: "{}" }).catch(error => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
  });

  it("keeps an object URL until the viewer cleanup callback runs", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:viewer-file");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const resource = createEvidenceObjectUrl(new Blob(["content"]));
    expect(resource.url).toBe("blob:viewer-file");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    resource.revoke();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:viewer-file");
  });

  it("downloads through an attached temporary anchor and preserves the filename", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "download-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Blob(["image"], { type: "image/png" }), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": 'inline; filename="original.png"',
          },
        }),
      ),
    );
    const anchor = {
      href: "",
      download: "",
      style: { display: "" },
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(anchor),
      body: { appendChild },
    });
    vi.stubGlobal("window", {
      setTimeout: (callback: () => void) => callback(),
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:download"),
      revokeObjectURL,
    });

    await downloadPrivateAttachment(7, "fallback.png");

    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.download).toBe("original.png");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
  });
});
