import type { OperationAuthority } from "../../shared/index.js";
import {
  type DetectedSerialDevice,
  type RegisteredSerialDevices,
  type SerialDeviceRole,
  type SerialDeviceStanding,
  serialDeviceStandings,
} from "../model/serial-devices.js";
import type { SerialDeviceEnumeration } from "./serial-device-enumeration.js";
import type { SerialDeviceRegistrations } from "./serial-device-registrations.js";

export interface ReadSerialDevicesPorts<Grant, Refusal> {
  registrations: SerialDeviceRegistrations;
  enumeration: SerialDeviceEnumeration;
  authority: OperationAuthority<Grant, Refusal>;
}

export type ReadSerialDevicesOutcome = {
  kind: "read";
  registered: RegisteredSerialDevices;
  detected: DetectedSerialDevice[];
  standings: Record<SerialDeviceRole, SerialDeviceStanding>;
};

export async function readSerialDevices<Grant, Refusal>({
  registrations,
  enumeration,
  authority,
}: ReadSerialDevicesPorts<Grant, Refusal>): Promise<ReadSerialDevicesOutcome | Refusal> {
  const authorization = await authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const registered = registrations.registeredSerialDevices();
  const detected = await enumeration.detectedSerialDevices();
  return {
    kind: "read",
    registered,
    detected,
    standings: serialDeviceStandings(registered, detected),
  };
}
