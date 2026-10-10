import type { RegisteredSerialDevices } from "../../model/serial-devices.js";
import type {
  SerialDeviceRegistrations,
  SerialDeviceRegistrationsTransaction,
} from "../serial-device-registrations.js";

export class FakeSerialDeviceRegistrations implements SerialDeviceRegistrations {
  reads = 0;
  saves = 0;
  transactions = 0;
  readsOutsideTransactions = 0;
  private devices: RegisteredSerialDevices;

  constructor(devices: RegisteredSerialDevices = {}) {
    this.devices = devices;
  }

  registeredSerialDevices(): RegisteredSerialDevices {
    this.reads += 1;
    this.readsOutsideTransactions += 1;
    return this.devices;
  }

  transaction<TOutcome>(work: (tx: SerialDeviceRegistrationsTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    let working = this.devices;
    const outcome = work({
      registeredSerialDevices: () => {
        this.reads += 1;
        return working;
      },
      saveSerialDevices: (devices) => {
        this.saves += 1;
        working = devices;
      },
    });
    this.devices = working;
    return outcome;
  }
}
