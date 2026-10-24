import { act, useEffect } from "react";
import type { CameraUnavailableReason, QrScannerProps } from "../qr-camera-scanner";

export function createFakeQrScanner() {
  let live: QrScannerProps | undefined;
  const state = { mounts: 0 };

  function FakeQrScanner(props: QrScannerProps) {
    useEffect(() => {
      state.mounts += 1;
      live = props;
      return () => {
        live = undefined;
      };
    }, [props]);
    return <div role="img" aria-label="Cámara" />;
  }

  return {
    Scanner: FakeQrScanner,
    mounts: () => state.mounts,
    isShown: () => live !== undefined,
    show(text: string) {
      act(() => live?.onCode(text));
    },
    fail(reason: CameraUnavailableReason) {
      act(() => live?.onUnavailable(reason));
    },
  };
}
