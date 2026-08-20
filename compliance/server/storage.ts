import { mkdirSync, createReadStream } from "node:fs";
import { writeFile, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { config } from "./config.js";

export type StoredObject = {
  stream: NodeJS.ReadableStream;
  contentType?: string;
  length?: number;
};
export interface ObjectStorage {
  readonly provider: "local" | "azure-blob";
  put(
    data: Buffer,
    originalName: string,
    contentType?: string,
  ): Promise<string>;
  get(key: string): Promise<StoredObject>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export function storedObjectFromAzureDownload(response: {
  readableStreamBody?: NodeJS.ReadableStream;
  contentType?: string;
  contentLength?: number;
}): StoredObject {
  if (!response.readableStreamBody) throw new Error("Blob content unavailable");
  return {
    stream: response.readableStreamBody,
    contentType: response.contentType,
    length: response.contentLength,
  };
}

const safeKey = (key: string) => {
  if (!/^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/.test(key) || key.includes(".."))
    throw new Error("Invalid object key");
  return key;
};

export class LocalStorage implements ObjectStorage {
  readonly provider = "local" as const;
  private root = resolve(config.LOCAL_STORAGE_PATH);
  async put(data: Buffer, name: string) {
    const extension = name.includes(".")
      ? `.${name
          .split(".")
          .pop()!
          .replace(/[^a-z0-9]/gi, "")}`
      : "";
    const key = `${new Date().getFullYear()}/${randomUUID()}${extension}`,
      path = resolve(this.root, key);
    if (!path.startsWith(this.root)) throw new Error("Invalid object key");
    mkdirSync(dirname(path), { recursive: true });
    await writeFile(path, data, { mode: 0o600 });
    return key;
  }
  async get(key: string) {
    const path = resolve(this.root, safeKey(key));
    if (!path.startsWith(this.root)) throw new Error("Invalid object key");
    const info = await stat(path);
    return { stream: createReadStream(path), length: info.size };
  }
  async delete(key: string) {
    const path = resolve(this.root, safeKey(key));
    if (!path.startsWith(this.root)) throw new Error("Invalid object key");
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  async exists(key: string) {
    const path = resolve(this.root, safeKey(key));
    if (!path.startsWith(this.root)) throw new Error("Invalid object key");
    return stat(path).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    );
  }
}

export class AzureBlobStorage implements ObjectStorage {
  readonly provider = "azure-blob" as const;
  private container = new BlobServiceClient(
    `https://${config.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  ).getContainerClient(config.AZURE_STORAGE_CONTAINER);
  async put(data: Buffer, name: string, contentType?: string) {
    const extension = name.includes(".")
      ? `.${name
          .split(".")
          .pop()!
          .replace(/[^a-z0-9]/gi, "")}`
      : "";
    const key = `${new Date().getFullYear()}/${randomUUID()}${extension}`;
    await this.container.getBlockBlobClient(key).uploadData(data, {
      blobHTTPHeaders: {
        blobContentType: contentType || "application/octet-stream",
      },
      metadata: {
        originalName: Buffer.from(name).toString("base64url"),
        uploadedAt: new Date().toISOString(),
      },
    });
    return key;
  }
  async get(key: string) {
    const response = await this.container
      .getBlobClient(safeKey(key))
      .download();
    return storedObjectFromAzureDownload(response);
  }
  async delete(key: string) {
    await this.container.getBlobClient(safeKey(key)).deleteIfExists();
  }
  async exists(key: string) {
    return this.container.getBlobClient(safeKey(key)).exists();
  }
}

export const storage: ObjectStorage =
  config.STORAGE_PROVIDER === "azure-blob"
    ? new AzureBlobStorage()
    : new LocalStorage();
