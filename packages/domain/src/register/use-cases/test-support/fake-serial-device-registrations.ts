import type { RegisteredSerialDevices } from "../../model/serial-devices.js";
import type { SerialDeviceRegistrations } from "../serial-device-registrations.js";

export class FakeSerialDeviceRegistrations implements SerialDeviceRegistrations {
  reads = 0;
  saves = 0;
  private devices: RegisteredSerialDevices;

  constructor(devices: RegisteredSerialDevices = {}) {
    this.devices = devices;
  }

  registeredSerialDevices(): RegisteredSerialDevices {
    this.reads += 1;
    return this.devices;
  }

  saveSerialDevices(devices: RegisteredSerialDevices): void {
    this.saves += 1;
    this.devices = devices;
  }
}
