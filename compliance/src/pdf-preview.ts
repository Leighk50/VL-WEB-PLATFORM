export function sanitizePdfPreviewError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted URL]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

export function clampPdfPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

export function clampPdfZoom(zoom: number) {
  return Math.min(2.5, Math.max(0.5, Math.round(zoom * 100) / 100));
}
