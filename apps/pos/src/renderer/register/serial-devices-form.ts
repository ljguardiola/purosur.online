import { registerSerialDevicesMessageSchema } from "@purosur/contracts";
import type { Option, Options } from "@purosur/ui";
import type { SerialDevicesToRegister } from "../platform/core-client";
import type { ShownSerialDevices } from "./register-queries";
import type { SerialDeviceRole } from "./serial-device-standing";

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

export function serialDeviceOptions(
  role: SerialDeviceRole,
  { registered, detected }: Pick<Read, "registered" | "detected">,
): Options<Option> {
  const firstPortOf = new Map<string, string>();
  for (const device of detected) {
    const key = choiceKey(device);
    if (!firstPortOf.has(key)) {
      firstPortOf.set(key, device.path);
    }
  }
  const connected = [...firstPortOf].map(([key, path]) => ({
    value: key,
    label: `${key} (${path})`,
  }));
  const identity = registered[role];
  if (identity === undefined) {
    return [{ value: NOT_ASSIGNED, label: "Sin asignar" }, ...connected];
  }
  const registeredKey = choiceKey(identity);
  const [first, ...rest] = connected;
  if (first === undefined || !firstPortOf.has(registeredKey)) {
    return [{ value: registeredKey, label: `${registeredKey} (no conectado)` }, ...connected];
  }
  return [first, ...rest];
}

export function serialDevicesFormFrom(registered: Read["registered"]): SerialDevicesFormValues {
  return {
    scale: registered.scale === undefined ? NOT_ASSIGNED : choiceKey(registered.scale),
    reader: registered.reader === undefined ? NOT_ASSIGNED : choiceKey(registered.reader),
  };
}

export function savedSerialDevicesDescription({
  scale,
  reader,
}: Read["registered"]): string | undefined {
  if (scale !== undefined && reader !== undefined) {
    return "La caja reconoce la balanza y el lector elegidos.";
  }
  if (scale !== undefined) {
    return "La caja reconoce la balanza elegida.";
  }
  if (reader !== undefined) {
    return "La caja reconoce el lector elegido.";
  }
  return undefined;
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
