import type { RegisteredSerialDevices } from "@purosur/domain";
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

function save(devices: RegisteredSerialDevices): void {
  registrations.transaction((tx) => tx.saveSerialDevices(devices));
}

describe("SqliteSerialDeviceRegistrations", () => {
  it("has no device until one is saved", () => {
    expect(registrations.registeredSerialDevices()).toEqual({});
  });

  it("reads back the scale and the reader it saved", () => {
    save({ scale: SCALE, reader: READER });

    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE, reader: READER });
  });

  it("reads back a register that holds only one of the two", () => {
    save({ reader: READER });

    expect(registrations.registeredSerialDevices()).toEqual({ reader: READER });
  });

  it("replaces what it held, leaving a role it no longer receives without a device", () => {
    save({ scale: SCALE, reader: READER });
    save({ scale: SCALE });

    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE });
  });

  it("swaps the scale and the reader without meeting its own uniqueness", () => {
    save({ scale: SCALE, reader: READER });
    save({ scale: READER, reader: SCALE });

    expect(registrations.registeredSerialDevices()).toEqual({ scale: READER, reader: SCALE });
  });

  it("keeps what it held when the devices it receives break the database's rules", () => {
    save({ scale: SCALE, reader: READER });

    expect(() => save({ scale: READER, reader: READER })).toThrow(/UNIQUE/);
    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE, reader: READER });
  });

  it("reads within its transaction what it saved there", () => {
    save({ scale: SCALE });

    const read = registrations.transaction((tx) => {
      tx.saveSerialDevices({ scale: SCALE, reader: READER });
      return tx.registeredSerialDevices();
    });

    expect(read).toEqual({ scale: SCALE, reader: READER });
  });

  it("keeps what it held when the work of its transaction fails after saving", () => {
    save({ scale: SCALE });

    expect(() =>
      registrations.transaction((tx) => {
        tx.saveSerialDevices({ reader: READER });
        throw new Error("the operation failed after saving");
      }),
    ).toThrow("the operation failed after saving");
    expect(registrations.registeredSerialDevices()).toEqual({ scale: SCALE });
  });
});
