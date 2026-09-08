import "dotenv/config";
import { randomUUID } from "node:crypto";
import { storage } from "./storage.js";

if (storage.provider !== "azure-blob")
  throw new Error("Storage diagnostic requires STORAGE_PROVIDER=azure-blob");

const expected = Buffer.from(
  "%PDF-1.4\n% Compliance managed-identity storage diagnostic\n",
);
const filename = `compliance-storage-diagnostic-${randomUUID()}.pdf`;
let key: string | undefined;
try {
  key = await storage.put(expected, filename, "application/pdf");
  if (!(await storage.exists(key)))
    throw new Error("Diagnostic Blob was not visible after upload");
  const downloaded = await storage.get(key);
  const chunks: Buffer[] = [];
  for await (const chunk of downloaded.stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!Buffer.concat(chunks).equals(expected))
    throw new Error("Downloaded diagnostic bytes did not match the upload");
  if (downloaded.contentType !== "application/pdf")
    throw new Error(
      `Unexpected diagnostic content type: ${downloaded.contentType}`,
    );
  console.log(`Azure Blob managed-identity diagnostic succeeded (${key}).`);
} finally {
  if (key) await storage.delete(key);
}
