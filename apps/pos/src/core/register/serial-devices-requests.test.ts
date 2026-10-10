import { encodePinHash } from "@purosur/contracts";
import type { DetectedSerialDevice } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { readSerialDevicesFor, registerSerialDevicesFor } from "./serial-devices-requests";
import { SqliteSerialDeviceRegistrations } from "./sqlite-serial-device-registrations";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;
let detected: DetectedSerialDevice[];
const recheck = vi.fn(async () => undefined);

function gate() {
  return createActionGate({
    store: new SqliteSignInStore(database),
    signedInPerson,
    readPepper: async () => PEPPER,
    hashPin: async () => "hash-of-a-pin",
    now: () => new Date("2026-10-08T12:00:00.000Z"),
  });
}

function readDeps() {
  return {
    database,
    gate: gate(),
    enumeration: { detectedSerialDevices: async () => detected },
  };
}

function registerDeps() {
  return { database, gate: gate(), recheck };
}

function addPerson(id: string, permissions: string[]): void {
  database
    .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, 'Rol', 0, 1)")
    .run(`role-${id}`);
  for (const key of permissions) {
    database
      .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
      .run(`role-${id}`, key);
  }
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ada', ?, ?, 1, 1)",
    )
    .run(id, `role-${id}`, encodePinHash(new Uint8Array(16).fill(1)));
}

const SCALE = { vendor_id: "1a86", product_id: "7523" };
const READER = { vendor_id: "26f1", product_id: "8802" };

function storedDevices() {
  return new SqliteSerialDeviceRegistrations(database).registeredSerialDevices();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  addPerson("installer", ["enroll_register_devices"]);
  addPerson("cashier", ["sell_and_charge"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("installer");
  detected = [];
  recheck.mockClear();
});

afterEach(() => {
  database.close();
});

describe("reading the serial devices", () => {
  it("answers nothing registered and what is plugged in, with the standings", async () => {
    detected = [{ path: "COM3", identity: { vendorId: "1a86", productId: "7523" } }];

    expect(await readSerialDevicesFor(readDeps())).toEqual({
      kind: "read",
      registered: {},
      detected: [{ path: "COM3", ...SCALE }],
      standings: { scale: { kind: "not_registered" }, reader: { kind: "not_registered" } },
    });
  });

  it("answers the registered devices and where each one is plugged in", async () => {
    await registerSerialDevicesFor(registerDeps(), { scale: SCALE, reader: READER });
    detected = [{ path: "COM8", identity: { vendorId: "1a86", productId: "7523" } }];

    expect(await readSerialDevicesFor(readDeps())).toEqual({
      kind: "read",
      registered: { scale: SCALE, reader: READER },
      detected: [{ path: "COM8", ...SCALE }],
      standings: {
        scale: { kind: "matching", path: "COM8" },
        reader: { kind: "not_detected" },
      },
    });
  });

  it("answers not_signed_in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await readSerialDevicesFor(readDeps())).toEqual({ kind: "not_signed_in" });
  });

  it("answers lacks_permission to a person who may not configure the serial devices", async () => {
    signedInPerson.set("cashier");

    expect(await readSerialDevicesFor(readDeps())).toEqual({ kind: "lacks_permission" });
  });
});

describe("registering the serial devices", () => {
  it("registers the scale and the reader and answers them", async () => {
    expect(
      await registerSerialDevicesFor(registerDeps(), { scale: SCALE, reader: READER }),
    ).toEqual({ kind: "registered", devices: { scale: SCALE, reader: READER } });
    expect(storedDevices()).toEqual({
      scale: { vendorId: "1a86", productId: "7523" },
      reader: { vendorId: "26f1", productId: "8802" },
    });
  });

  it("keeps the device of the role it receives none for", async () => {
    await registerSerialDevicesFor(registerDeps(), { scale: SCALE, reader: READER });

    const otherReader = { vendor_id: "0403", product_id: "6001" };

    expect(await registerSerialDevicesFor(registerDeps(), { reader: otherReader })).toEqual({
      kind: "registered",
      devices: { scale: SCALE, reader: otherReader },
    });
  });

  it("checks the plugged-in devices again once it registered them", async () => {
    await registerSerialDevicesFor(registerDeps(), { scale: SCALE });

    expect(recheck).toHaveBeenCalledTimes(1);
  });

  it("answers same_identity_for_both, keeps what was registered and checks nothing", async () => {
    await registerSerialDevicesFor(registerDeps(), { scale: SCALE, reader: READER });
    recheck.mockClear();

    expect(await registerSerialDevicesFor(registerDeps(), { reader: SCALE })).toEqual({
      kind: "same_identity_for_both",
    });
    expect(await registerSerialDevicesFor(registerDeps(), { scale: READER })).toEqual({
      kind: "same_identity_for_both",
    });
    expect(storedDevices()).toEqual({
      scale: { vendorId: "1a86", productId: "7523" },
      reader: { vendorId: "26f1", productId: "8802" },
    });
    expect(recheck).not.toHaveBeenCalled();
  });

  it("answers not_signed_in and registers nothing when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await registerSerialDevicesFor(registerDeps(), { scale: SCALE })).toEqual({
      kind: "not_signed_in",
    });
    expect(storedDevices()).toEqual({});
    expect(recheck).not.toHaveBeenCalled();
  });

  it("answers lacks_permission and registers nothing to a person who may not configure the serial devices", async () => {
    signedInPerson.set("cashier");

    expect(await registerSerialDevicesFor(registerDeps(), { scale: SCALE })).toEqual({
      kind: "lacks_permission",
    });
    expect(storedDevices()).toEqual({});
  });
});
