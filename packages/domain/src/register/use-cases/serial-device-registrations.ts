import type { RegisteredSerialDevices } from "../model/serial-devices.js";

export interface SerialDeviceRegistrations {
  registeredSerialDevices(): RegisteredSerialDevices;
  transaction<TOutcome>(work: (tx: SerialDeviceRegistrationsTransaction) => TOutcome): TOutcome;
}

export interface SerialDeviceRegistrationsTransaction {
  registeredSerialDevices(): RegisteredSerialDevices;
  saveSerialDevices(devices: RegisteredSerialDevices): void;
}
