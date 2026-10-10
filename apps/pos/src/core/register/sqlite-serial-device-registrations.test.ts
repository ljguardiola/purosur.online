import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteSerialDeviceRegistrations } from "./sqlite-serial-device-registrations";

const SCALE = { vendorId: "1a86", productId: "7523" };
const READER = { vendorId: "26f1", productId: "8802" };

let database: LocalDatabase;
let registrations: SqliteSerialDeviceRegistrations;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  registrations = new SqliteSerialDeviceRegistrations(database);
});

afterEach(() => {
  database.close();
});

describe("SqliteSerialDeviceRegistrations", () => {
  it("has no device until one is saved", () => {
    expect(registrations.registeredSerialDevices()).toEqual({});
  });

  it("reads back the scale and the reader it saved", () => {
    registrations.saveSerialDevices({ scale: SCALE, reader: READER });

    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE, reader: READER });
  });

  it("reads back a register that holds only one of the two", () => {
    registrations.saveSerialDevices({ reader: READER });

    expect(registrations.registeredSerialDevices()).toEqual({ reader: READER });
  });

  it("replaces what it held, leaving a role it no longer receives without a device", () => {
    registrations.saveSerialDevices({ scale: SCALE, reader: READER });
    registrations.saveSerialDevices({ scale: SCALE });

    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE });
  });

  it("swaps the scale and the reader without meeting its own uniqueness", () => {
    registrations.saveSerialDevices({ scale: SCALE, reader: READER });
    registrations.saveSerialDevices({ scale: READER, reader: SCALE });

    expect(registrations.registeredSerialDevices()).toEqual({ scale: READER, reader: SCALE });
  });

  it("keeps what it held when the devices it receives break the database's rules", () => {
    registrations.saveSerialDevices({ scale: SCALE, reader: READER });

    expect(() => registrations.saveSerialDevices({ scale: READER, reader: READER })).toThrow(
      /UNIQUE/,
    );
    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE, reader: READER });
  });
});
