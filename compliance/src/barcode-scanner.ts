export const SUPPORTED_BARCODE_FORMATS = [
  "code_128",
  "code_39",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "qr_code",
] as const;

export function cameraErrorMessage(error: unknown) {
  if (
    error instanceof DOMException &&
    ["NotAllowedError", "PermissionDeniedError"].includes(error.name)
  )
    return "Camera permission was denied. Allow camera access or enter the barcode manually.";
  if (error instanceof DOMException && error.name === "NotFoundError")
    return "No camera was found. Enter the barcode manually.";
  return "The camera could not be started. Try again or enter the barcode manually.";
}

export function stopCamera(
  stream?: MediaStream | null,
  controls?: { stop(): void } | null,
) {
  controls?.stop();
  stream?.getTracks().forEach((track) => track.stop());
}
