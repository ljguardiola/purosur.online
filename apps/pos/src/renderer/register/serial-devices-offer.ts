import type { OpenCashSession, RegisterStatus } from "@purosur/contracts";
import { useState } from "react";

export async function landsOnSerialDevicesAfterSignIn({
  offerPending,
  settleOffer,
  readStatus,
}: {
  offerPending: boolean;
  settleOffer: () => void;
  readStatus: () => Promise<RegisterStatus>;
}): Promise<boolean> {
  if (!offerPending) {
    return false;
  }
  const status = await readStatus().catch(() => undefined);
  settleOffer();
  return status?.serial_devices_setup_offered === true;
}

export function serialDevicesOffer() {
  let offerPending = false;
  return {
    offerSerialDevicesAfterSignIn: (cashSession: OpenCashSession | null) => {
      offerPending = cashSession === null;
    },
    takeSerialDevicesOffer: (readStatus: () => Promise<RegisterStatus>) =>
      landsOnSerialDevicesAfterSignIn({
        offerPending,
        settleOffer: () => {
          offerPending = false;
        },
        readStatus,
      }),
  };
}

export function useSerialDevicesOffer() {
  const [offer] = useState(serialDevicesOffer);
  return offer;
}
