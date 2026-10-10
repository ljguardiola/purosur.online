import { encodePinHash } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import {
  type ReceiptPrinterRequestDeps,
  readReceiptPrinterFor,
  setReceiptPrinterFor,
} from "./receipt-printer-requests";
import { SqliteReceiptPrinterSettings } from "./sqlite-receipt-printer-settings";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function deps(): ReceiptPrinterRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => PEPPER,
      hashPin: async () => "hash-of-a-pin",
      now: () => new Date("2026-10-08T12:00:00.000Z"),
    }),
  };
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

function storedAddress() {
  return new SqliteReceiptPrinterSettings(database).receiptPrinterAddress();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  addPerson("installer", ["enroll_register_devices"]);
  addPerson("cashier", ["sell_and_charge"]);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("installer");
});

afterEach(() => {
  database.close();
});

describe("reading the receipt printer", () => {
  it("answers not_configured while no address is saved", async () => {
    expect(await readReceiptPrinterFor(deps())).toEqual({ kind: "not_configured" });
  });

  it("answers the saved address", async () => {
    await setReceiptPrinterFor(deps(), "10.10.10.2:9100");

    expect(await readReceiptPrinterFor(deps())).toEqual({
      kind: "configured",
      address: { host: "10.10.10.2", port: 9100 },
    });
  });

  it("answers not_signed_in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await readReceiptPrinterFor(deps())).toEqual({ kind: "not_signed_in" });
  });

  it("answers lacks_permission to a person who may not configure the printer", async () => {
    signedInPerson.set("cashier");

    expect(await readReceiptPrinterFor(deps())).toEqual({ kind: "lacks_permission" });
  });
});

describe("setting the receipt printer", () => {
  it("saves a typed address and answers it", async () => {
    expect(await setReceiptPrinterFor(deps(), " 10.10.10.2:9100 ")).toEqual({
      kind: "saved",
      address: { host: "10.10.10.2", port: 9100 },
    });
    expect(storedAddress()).toEqual({ host: "10.10.10.2", port: 9100 });
  });

  it("saves an address without a port as the printer's default port", async () => {
    expect(await setReceiptPrinterFor(deps(), "ticketera")).toEqual({
      kind: "saved",
      address: { host: "ticketera", port: null },
    });
  });

  it("answers invalid_address and keeps the saved one when the text is not an address", async () => {
    await setReceiptPrinterFor(deps(), "10.10.10.2");

    expect(await setReceiptPrinterFor(deps(), "10.10.10.2:99999")).toEqual({
      kind: "invalid_address",
    });
    expect(await setReceiptPrinterFor(deps(), "")).toEqual({ kind: "invalid_address" });
    expect(storedAddress()).toEqual({ host: "10.10.10.2", port: null });
  });

  it("answers not_signed_in and saves nothing when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await setReceiptPrinterFor(deps(), "10.10.10.2")).toEqual({ kind: "not_signed_in" });
    expect(storedAddress()).toBeUndefined();
  });

  it("answers lacks_permission and saves nothing to a person who may not configure the printer", async () => {
    signedInPerson.set("cashier");

    expect(await setReceiptPrinterFor(deps(), "10.10.10.2")).toEqual({ kind: "lacks_permission" });
    expect(storedAddress()).toBeUndefined();
  });
});
