import type { DetectedSerialDevice } from "../model/serial-devices.js";

export interface SerialDeviceEnumeration {
  detectedSerialDevices(): Promise<DetectedSerialDevice[]>;
}
