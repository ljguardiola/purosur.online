import type { OpenCashSession, RegisterStatus } from "@purosur/contracts";
import { useState } from "react";
import type { SignedInPerson } from "../shell/signed-in-person";

export function mayConfigureSerialDevices(person: SignedInPerson): boolean {
  return person.abilities.includes("configure_serial_devices");
}

export function landsOnSerialDevices({
  person,
  status,
}: {
  person: SignedInPerson;
  status: RegisterStatus | undefined;
}): boolean {
  return (
    mayConfigureSerialDevices(person) &&
    status?.serial_devices.scale === "not_registered" &&
    status.serial_devices.reader === "not_registered"
  );
}

export async function landsOnSerialDevicesAfterSignIn({
  person,
  offerPending,
  settleOffer,
  readStatus,
}: {
  person: SignedInPerson;
  offerPending: boolean;
  settleOffer: () => void;
  readStatus: () => Promise<RegisterStatus>;
}): Promise<boolean> {
  if (!offerPending) {
    return false;
  }
  const status = mayConfigureSerialDevices(person)
    ? await readStatus().catch(() => undefined)
    : undefined;
  settleOffer();
  return landsOnSerialDevices({ person, status });
}

export function serialDevicesOffer() {
  let offerPending = false;
  return {
    offerSerialDevicesAfterSignIn: (cashSession: OpenCashSession | null) => {
      offerPending = cashSession === null;
    },
    takeSerialDevicesOffer: (person: SignedInPerson, readStatus: () => Promise<RegisterStatus>) =>
      landsOnSerialDevicesAfterSignIn({
        person,
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
