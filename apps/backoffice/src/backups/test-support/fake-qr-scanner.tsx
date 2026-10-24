import { useEffect } from "react";
import type { CameraUnavailableReason, QrScannerProps } from "../qr-camera-scanner";

export function createFakeQrScanner() {
  let live: QrScannerProps | undefined;
  const state = { mounts: 0 };

  function FakeQrScanner(props: QrScannerProps) {
    useEffect(() => {
      state.mounts += 1;
      return () => {
        live = undefined;
      };
    }, []);
    useEffect(() => {
      live = props;
    });
    return (
      <div role="img" aria-label="Cámara">
        vista de la cámara
      </div>
    );
  }

  return {
    Scanner: FakeQrScanner,
    mounts: () => state.mounts,
    isShown: () => live !== undefined,
    show(text: string) {
      live?.onCode(text);
    },
    fail(reason: CameraUnavailableReason) {
      live?.onUnavailable(reason);
    },
  };
}
