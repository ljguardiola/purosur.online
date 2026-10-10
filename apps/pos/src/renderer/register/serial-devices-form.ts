import { registerSerialDevicesMessageSchema } from "@purosur/contracts";
import type { Option, Options } from "@purosur/ui";
import type { SerialDevicesToRegister } from "../platform/core-client";
import type { ShownSerialDevices } from "./register-queries";

export const serialDevicesRequestSchema = registerSerialDevicesMessageSchema.pick({
  devices: true,
});

export const SAME_SERIAL_DEVICE_MESSAGE =
  "La balanza y el lector no pueden ser el mismo dispositivo.";

export const NOT_ASSIGNED = "none";

type Read = Extract<ShownSerialDevices, { kind: "read" }>;
type DetectedDevice = Read["detected"][number];
type Identity = Pick<DetectedDevice, "vendor_id" | "product_id">;

export type SerialDevicesFormValues = { scale: string; reader: string };

function choiceKey({ vendor_id, product_id }: Identity): string {
  return [vendor_id, product_id].join(":");
}

function identityOf(choice: string): Identity {
  const [vendor_id = "", product_id = ""] = choice.split(":");
  return { vendor_id, product_id };
}

export function serialDeviceOptions(detected: readonly DetectedDevice[]): Options<Option> {
  const firstPortOf = new Map<string, string>();
  for (const device of detected) {
    const key = choiceKey(device);
    if (!firstPortOf.has(key)) {
      firstPortOf.set(key, device.path);
    }
  }
  return [
    { value: NOT_ASSIGNED, label: "Sin asignar" },
    ...[...firstPortOf].map(([key, path]) => ({ value: key, label: `${key} (${path})` })),
  ];
}

function choiceFor(identity: Identity | undefined, detected: readonly DetectedDevice[]): string {
  if (identity === undefined) {
    return NOT_ASSIGNED;
  }
  const key = choiceKey(identity);
  return detected.some((device) => choiceKey(device) === key) ? key : NOT_ASSIGNED;
}

export function serialDevicesFormFrom(
  registered: Read["registered"],
  detected: readonly DetectedDevice[],
): SerialDevicesFormValues {
  return {
    scale: choiceFor(registered.scale, detected),
    reader: choiceFor(registered.reader, detected),
  };
}

export function serialDevicesRequestFrom({ scale, reader }: SerialDevicesFormValues): {
  devices: SerialDevicesToRegister;
} {
  return {
    devices: {
      ...(scale === NOT_ASSIGNED ? {} : { scale: identityOf(scale) }),
      ...(reader === NOT_ASSIGNED ? {} : { reader: identityOf(reader) }),
    },
  };
}
