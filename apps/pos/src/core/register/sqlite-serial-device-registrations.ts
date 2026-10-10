import type { RegisteredSerialDevices, SerialDeviceRole } from "@purosur/domain";
import { SERIAL_DEVICE_ROLES } from "@purosur/domain";
import type {
  SerialDeviceRegistrations,
  SerialDeviceRegistrationsTransaction,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface SerialDeviceRow {
  role: SerialDeviceRole;
  vendor_id: string;
  product_id: string;
}

export class SqliteSerialDeviceRegistrations implements SerialDeviceRegistrations {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  registeredSerialDevices(): RegisteredSerialDevices {
    const rows = this.database
      .prepare<[], SerialDeviceRow>("SELECT role, vendor_id, product_id FROM serial_devices")
      .all();
    return Object.fromEntries(
      rows.map(({ role, vendor_id, product_id }) => [
        role,
        { vendorId: vendor_id, productId: product_id },
      ]),
    );
  }

  transaction<TOutcome>(work: (tx: SerialDeviceRegistrationsTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() =>
      work({
        registeredSerialDevices: () => this.registeredSerialDevices(),
        saveSerialDevices: (devices) => this.replaceSerialDevices(devices),
      }),
    )();
  }

  private replaceSerialDevices(devices: RegisteredSerialDevices): void {
    const insert = this.database.prepare(
      "INSERT INTO serial_devices (role, vendor_id, product_id) VALUES (@role, @vendor_id, @product_id)",
    );
    this.database.prepare("DELETE FROM serial_devices").run();
    for (const role of SERIAL_DEVICE_ROLES) {
      const identity = devices[role];
      if (identity !== undefined) {
        insert.run({ role, vendor_id: identity.vendorId, product_id: identity.productId });
      }
    }
  }
}
