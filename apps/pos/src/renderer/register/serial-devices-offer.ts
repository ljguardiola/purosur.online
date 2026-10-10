import type { RegisterStatus, SignInOutcome } from "@purosur/contracts";
import { useRef } from "react";
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

export function useSerialDevicesOffer() {
  const offerPending = useRef(false);
  return {
    offerSerialDevicesAfter: (outcome: SignInOutcome) => {
      offerPending.current = outcome.kind === "signed_in" && outcome.cash_session === null;
    },
    takeSerialDevicesOffer: (person: SignedInPerson, readStatus: () => Promise<RegisterStatus>) =>
      landsOnSerialDevicesAfterSignIn({
        person,
        offerPending: offerPending.current,
        settleOffer: () => {
          offerPending.current = false;
        },
        readStatus,
      }),
  };
}
