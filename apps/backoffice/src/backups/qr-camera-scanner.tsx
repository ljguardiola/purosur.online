import { useEffect, useEffectEvent, useRef } from "react";
import { decodeWithJsQr } from "./jsqr-decoder";

export type QrDecoder = (frame: ImageData) => Promise<string | null>;

export type CameraUnavailableReason = "denied" | "no_camera";

export type QrScannerProps = {
  onCode: (text: string) => void;
  onUnavailable: (reason: CameraUnavailableReason) => void;
};

export type QrCameraScannerProps = QrScannerProps & { decoder?: QrDecoder };

const SCAN_INTERVAL_MS = 100;

export function QrCameraScanner({
  onCode,
  onUnavailable,
  decoder = decodeWithJsQr,
}: QrCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reportCode = useEffectEvent(onCode);
  const reportUnavailable = useEffectEvent(onUnavailable);
  const decode = useEffectEvent(decoder);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastReported: string | null = null;
    const canvas = document.createElement("canvas");

    async function scan() {
      if (video !== null && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context?.drawImage(video, 0, 0);
        const frame = context?.getImageData(0, 0, canvas.width, canvas.height);
        const text = frame === undefined ? null : await decode(frame);
        if (stopped) {
          return;
        }
        if (text !== null && text !== lastReported) {
          reportCode(text);
        }
        lastReported = text;
      }
      timer = setTimeout(() => void scan(), SCAN_INTERVAL_MS);
    }

    async function start() {
      if (navigator.mediaDevices === undefined) {
        reportUnavailable("no_camera");
        return;
      }
      let granted: MediaStream;
      try {
        granted = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch (error) {
        if (!stopped) {
          reportUnavailable(
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "denied"
              : "no_camera",
          );
        }
        return;
      }
      if (stopped) {
        for (const track of granted.getTracks()) {
          track.stop();
        }
        return;
      }
      stream = granted;
      if (video !== null) {
        video.srcObject = granted;
        await video.play().catch(() => undefined);
      }
      void scan();
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      aria-label="Cámara"
      muted
      playsInline
      className="size-55 rounded-xl border-2 border-action bg-surface-subtle object-cover"
    />
  );
}
