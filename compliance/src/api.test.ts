import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPrivateAttachment } from "./api";

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
});
