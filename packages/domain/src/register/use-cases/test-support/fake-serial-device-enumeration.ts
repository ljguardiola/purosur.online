import type { DetectedSerialDevice } from "../../model/serial-devices.js";
import type { SerialDeviceEnumeration } from "../serial-device-enumeration.js";

export class FakeSerialDeviceEnumeration implements SerialDeviceEnumeration {
  enumerations = 0;
  private readonly devices: DetectedSerialDevice[];

  constructor(devices: DetectedSerialDevice[] = []) {
    this.devices = devices;
  }

  async detectedSerialDevices(): Promise<DetectedSerialDevice[]> {
    this.enumerations += 1;
    return this.devices;
  }
}
