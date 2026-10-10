import type { RegisterStatus } from "@purosur/contracts";
import type { SignedInPerson } from "../shell/signed-in-person";

export function mayConfigureSerialDevices(person: SignedInPerson): boolean {
  return person.abilities.includes("configure_serial_devices");
}

export function landsOnSerialDevices({
  person,
  status,
  dismissed = false,
}: {
  person: SignedInPerson;
  status: RegisterStatus | undefined;
  dismissed?: boolean;
}): boolean {
  return (
    !dismissed &&
    mayConfigureSerialDevices(person) &&
    status?.serial_devices.scale === "not_registered" &&
    status.serial_devices.reader === "not_registered"
  );
}
