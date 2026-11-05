import { useEffect, useLayoutEffect } from "react";
import type { CameraUnavailableReason, QrScannerProps } from "../qr-camera-scanner";

let live: QrScannerProps | undefined;
let mounts = 0;

function FakeQrScanner(props: QrScannerProps) {
  useEffect(() => {
    mounts += 1;
    return () => {
      live = undefined;
    };
  }, []);
  useLayoutEffect(() => {
    live = props;
  });
  return (
    <div role="img" aria-label="Cámara">
      vista de la cámara
    </div>
  );
}

export function createFakeQrScanner() {
  live = undefined;
  mounts = 0;
  return {
    Scanner: FakeQrScanner,
    mounts: () => mounts,
    isShown: () => live !== undefined,
    show(text: string) {
      live?.onCode(text);
    },
    fail(reason: CameraUnavailableReason) {
      live?.onUnavailable(reason);
    },
  };
}
