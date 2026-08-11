const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("compliance_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function api<T = any>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(authHeaders()))
    headers.set(key, value);
  const response = await fetch("/api" + path, {
    ...options,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body as T;
}

export async function uploadPhoto(
  entityType: string,
  id: number,
  file: File,
  main: boolean,
  caption = "",
) {
  const data = new FormData();
  data.set("file", file);
  data.set("is_main", main ? "1" : "0");
  data.set("caption", caption);
  const response = await fetch(`/api/${entityType}/${id}/photos`, {
    method: "POST",
    headers: new Headers(authHeaders()),
    body: data,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Photo upload failed");
  return body;
}

export async function privateImageUrl(storageKey: string) {
  const response = await fetch(`/files/${storageKey}`, {
    headers: new Headers(authHeaders()),
  });
  if (!response.ok) throw new Error("Photo could not be loaded");
  return URL.createObjectURL(await response.blob());
}

export async function uploadDocumentEvidence(
  documentId: number,
  files: File[],
) {
  const data = new FormData();
  files.forEach((file) => data.append("files", file));
  const response = await fetch(`/api/documents/${documentId}/attachments`, {
    method: "POST",
    headers: new Headers(authHeaders()),
    body: data,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Evidence upload failed");
  return body;
}

export async function privateAttachmentUrl(attachmentId: number) {
  return URL.createObjectURL((await fetchPrivateAttachment(attachmentId)).blob);
}

export async function fetchPrivateAttachment(attachmentId: number) {
  const response = await fetch(
    `/api/document-attachments/${attachmentId}/file`,
    {
      headers: new Headers(authHeaders()),
    },
  );
  if (!response.ok) throw new Error("Evidence file could not be loaded");
  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1];
  return {
    blob: await response.blob(),
    contentType:
      response.headers.get("Content-Type") || "application/octet-stream",
    filename,
  };
}

export type EvidencePreviewKind = "pdf" | "image" | "unavailable";

export function evidencePreviewKind(contentType: string): EvidencePreviewKind {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  if (normalized === "application/pdf") return "pdf";
  if (normalized.startsWith("image/")) return "image";
  return "unavailable";
}

export function createEvidenceObjectUrl(blob: Blob) {
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

export async function downloadPrivateAttachment(
  attachmentId: number,
  fallbackName: string,
) {
  const { blob, filename } = await fetchPrivateAttachment(attachmentId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || fallbackName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
