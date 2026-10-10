import type { RegisteredSerialDevices } from "../model/serial-devices.js";

export interface SerialDeviceRegistrations {
  registeredSerialDevices(): RegisteredSerialDevices;
  saveSerialDevices(devices: RegisteredSerialDevices): void;
}
