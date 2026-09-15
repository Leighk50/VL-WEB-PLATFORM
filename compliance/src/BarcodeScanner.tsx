import { useEffect, useRef, useState } from "react";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import {
  cameraErrorMessage,
  stopCamera,
  SUPPORTED_BARCODE_FORMATS,
} from "./barcode-scanner";

type NativeDetector = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
};
type NativeDetectorConstructor = {
  new (options: { formats: readonly string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

export function BarcodeScanner({
  onUse,
  onCancel,
}: {
  onUse: (code: string) => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Requesting camera permission…");
  const [detected, setDetected] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;
    let timer: number | undefined;
    let timeout: number | undefined;
    let stopped = false;
    const accept = (value?: string) => {
      const clean = value?.trim();
      if (!clean || stopped) return;
      stopped = true;
      if (timer) window.clearInterval(timer);
      if (timeout) window.clearTimeout(timeout);
      stopCamera(stream, controls);
      setDetected(clean);
      setMessage("Barcode detected. Confirm it or scan again.");
    };
    async function start() {
      try {
        const Native = (window as Window & {
          BarcodeDetector?: NativeDetectorConstructor;
        }).BarcodeDetector;
        if (Native) {
          const supported = Native.getSupportedFormats
            ? await Native.getSupportedFormats()
            : [...SUPPORTED_BARCODE_FORMATS];
          const formats = SUPPORTED_BARCODE_FORMATS.filter((format) =>
            supported.includes(format),
          );
          if (!formats.length) throw new DOMException("No supported formats", "NotSupportedError");
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          if (!video.current || stopped) return;
          video.current.srcObject = stream;
          await video.current.play();
          const detector = new Native({ formats });
          setMessage("Point the camera at the barcode inside the guide.");
          timer = window.setInterval(async () => {
            if (!video.current || video.current.readyState < 2) return;
            try {
              accept((await detector.detect(video.current))[0]?.rawValue);
            } catch {
              // A frame without a result is expected while the camera moves.
            }
          }, 300);
        } else {
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.QR_CODE,
          ]);
          const reader = new BrowserMultiFormatReader(hints, {
            delayBetweenScanAttempts: 250,
          });
          setMessage("Starting compatible camera scanner…");
          controls = await reader.decodeFromConstraints(
            {
              video: { facingMode: { ideal: "environment" } },
              audio: false,
            },
            video.current || undefined,
            (result) => accept(result?.getText()),
          );
          setMessage("Point the camera at the barcode inside the guide.");
        }
        timeout = window.setTimeout(
          () =>
            setMessage(
              "No barcode recognized yet. Try again or enter it manually.",
            ),
          30_000,
        );
      } catch (error) {
        if (!stopped) setMessage(cameraErrorMessage(error));
      }
    }
    void start();
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      if (timeout) window.clearTimeout(timeout);
      stopCamera(stream, controls);
      if (video.current) video.current.srcObject = null;
    };
  }, [attempt]);

  return (
    <div className="modalbackdrop" role="presentation">
      <section className="panel scanner" role="dialog" aria-modal="true" aria-label="Scan asset barcode">
        <div className="sectionhead">
          <h2>Scan asset barcode</h2>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        </div>
        {!detected && (
          <div className="scannerpreview">
            <video ref={video} playsInline muted />
            <div className="scannerguide" aria-hidden="true" />
          </div>
        )}
        <p aria-live="polite">{message}</p>
        {detected && (
          <div className="detectedbarcode">
            <strong>{detected}</strong>
            <div className="formactions">
              <button type="button" className="secondary" onClick={() => { setDetected(""); setAttempt((value) => value + 1); }}>Scan again</button>
              <button type="button" onClick={() => onUse(detected)}>Use barcode</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
