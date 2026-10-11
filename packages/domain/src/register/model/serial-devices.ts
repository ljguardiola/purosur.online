export const SERIAL_DEVICE_ROLES = ["scale", "reader"] as const;

export type SerialDeviceRole = (typeof SERIAL_DEVICE_ROLES)[number];

export interface SerialDeviceIdentity {
  vendorId: string;
  productId: string;
}

export interface DetectedSerialDevice {
  path: string;
  identity: SerialDeviceIdentity;
}

export type RegisteredSerialDevices = Partial<Record<SerialDeviceRole, SerialDeviceIdentity>>;

export type SerialDeviceStanding =
  | { kind: "matching"; path: string }
  | { kind: "not_detected" }
  | { kind: "mismatched" }
  | { kind: "not_registered" };

export const SERIAL_DEVICE_REPORT_STANDINGS = [
  "matching",
  "not_detected",
  "mismatched",
  "not_registered",
  "unknown",
] as const satisfies readonly (SerialDeviceStanding["kind"] | "unknown")[];

export type SerialDeviceReport = {
  standing: (typeof SERIAL_DEVICE_REPORT_STANDINGS)[number];
} & ({ vendor_id: string; product_id: string } | { vendor_id?: undefined; product_id?: undefined });

export type SerialDevicesReport = Record<SerialDeviceRole, SerialDeviceReport>;

export function isSameSerialDeviceIdentity(
  first: SerialDeviceIdentity,
  second: SerialDeviceIdentity,
): boolean {
  return first.vendorId === second.vendorId && first.productId === second.productId;
}

export function serialDeviceStandings(
  registered: RegisteredSerialDevices,
  detected: readonly DetectedSerialDevice[],
): Record<SerialDeviceRole, SerialDeviceStanding> {
  const registeredIdentities = SERIAL_DEVICE_ROLES.flatMap((role) => registered[role] ?? []);
  const hasUnknownDevice = detected.some(
    ({ identity }) =>
      !registeredIdentities.some((known) => isSameSerialDeviceIdentity(known, identity)),
  );

  function standingOf(role: SerialDeviceRole): SerialDeviceStanding {
    const identity = registered[role];
    if (identity === undefined) {
      return { kind: "not_registered" };
    }
    const [path] = detected
      .filter((device) => isSameSerialDeviceIdentity(device.identity, identity))
      .map((device) => device.path)
      .sort();
    if (path !== undefined) {
      return { kind: "matching", path };
    }
    return hasUnknownDevice ? { kind: "mismatched" } : { kind: "not_detected" };
  }

  return { scale: standingOf("scale"), reader: standingOf("reader") };
}

export function isSerialDeviceMissing(
  standings: Record<SerialDeviceRole, SerialDeviceStanding>,
): boolean {
  return SERIAL_DEVICE_ROLES.some(
    (role) => standings[role].kind === "not_detected" || standings[role].kind === "mismatched",
  );
}

export function offersSerialDevicesSetup({
  mayConfigure,
  standings,
}: {
  mayConfigure: boolean;
  standings: Record<SerialDeviceRole, { kind: SerialDeviceStanding["kind"] | "unknown" }>;
}): boolean {
  return (
    mayConfigure && SERIAL_DEVICE_ROLES.every((role) => standings[role].kind === "not_registered")
  );
}
