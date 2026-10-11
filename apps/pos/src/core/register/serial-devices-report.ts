import type {
  RegisteredSerialDevices,
  SerialDeviceReport,
  SerialDeviceRole,
  SerialDevicesReport,
} from "@purosur/domain";
import { SERIAL_DEVICE_ROLES } from "@purosur/domain";
import { readStanding, type SerialDeviceReading } from "./serial-device-watch";

function registeredIn(reading: SerialDeviceReading): RegisteredSerialDevices {
  return reading.kind === "unreadable" ? {} : reading.registered;
}

export function serialDevicesReportOf(reading: SerialDeviceReading): SerialDevicesReport {
  const registered = registeredIn(reading);

  function reportOf(role: SerialDeviceRole): SerialDeviceReport {
    const standing = readStanding(reading, role).kind;
    const identity = registered[role];
    return identity === undefined
      ? { standing }
      : { standing, vendor_id: identity.vendorId, product_id: identity.productId };
  }

  return {
    scale: reportOf(SERIAL_DEVICE_ROLES[0]),
    reader: reportOf(SERIAL_DEVICE_ROLES[1]),
  };
}
