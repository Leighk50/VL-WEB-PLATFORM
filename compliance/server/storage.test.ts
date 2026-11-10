import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { storedObjectFromAzureDownload } from "./storage.js";

describe("Azure Blob download adaptation", () => {
  it("preserves the Node readable stream, bytes and content type", async () => {
    const source = Readable.from(Buffer.from("%PDF-managed-identity-test"));
    const object = storedObjectFromAzureDownload({
      readableStreamBody: source,
      contentType: "application/pdf",
      contentLength: 26,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of object.stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("%PDF-managed-identity-test");
    expect(object.stream).toBe(source);
    expect(object.contentType).toBe("application/pdf");
  });
});
