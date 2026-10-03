export const MAX_EVIDENCE_SIZE = 15 * 1024 * 1024;

export const isAcceptedEvidence = (file: Pick<File, "name" | "type">) =>
  [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif",
  ].includes(file.type.toLowerCase()) ||
  /\.(pdf|jpe?g|png|heic|heif)$/i.test(file.name);

export function evidenceValidationError(
  files: Array<Pick<File, "name" | "type" | "size">>,
) {
  const oversized = files.find((file) => file.size > MAX_EVIDENCE_SIZE);
  if (oversized) return `${oversized.name} exceeds the 15 MB file-size limit.`;
  const unsupported = files.find((file) => !isAcceptedEvidence(file));
  if (unsupported)
    return `${unsupported.name} is not a supported PDF, JPG, PNG, HEIC or HEIF file.`;
  return null;
}
