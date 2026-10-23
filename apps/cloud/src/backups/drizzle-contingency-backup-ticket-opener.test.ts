import { randomBytes } from "node:crypto";
import { contingencyBackupTicketQrCodes } from "@purosur/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { keyStore } from "../register/test-support/key-store.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { DrizzleContingencyBackupTicketOpener } from "./drizzle-contingency-backup-ticket-opener.js";
import {
  generatedKey,
  sealedPlaintextQrCodes,
  sealedTicketQrCodes,
  ticketContent,
  ticketEvent,
} from "./test-support/sealed-contingency-backup-ticket.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const KEY_VERSION = 2;

let testDatabase: TestDatabase;
let opener: DrizzleContingencyBackupTicketOpener<Record<string, never>>;
let registerId: string;
let deviceId: string;
let key: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  opener = new DrizzleContingencyBackupTicketOpener(
    testDatabase.db,
    installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
  );
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const installation = await insertEnrolledInstallation(testDatabase.db, {
    now: NOW,
    registerName: "Caja 1",
  });
  registerId = installation.registerId;
  deviceId = installation.deviceId;
  key = generatedKey();
  await keyStore(testDatabase.db).transaction((tx) =>
    tx.recordContingencyTicketKey(registerId, { version: KEY_VERSION, key }),
  );
});

function sealedWith(content: unknown, overrides: { key?: string; keyVersion?: number } = {}) {
  return sealedTicketQrCodes({
    frameRegisterId: registerId,
    keyVersion: overrides.keyVersion ?? KEY_VERSION,
    key: overrides.key ?? key,
    content,
  });
}

describe("opening the QR codes of a contingency backup ticket", () => {
  it("opens a ticket sealed with the register's key", async () => {
    const events = [ticketEvent(4), ticketEvent(5)];

    const opening = await opener.open(sealedWith(ticketContent(registerId, deviceId, events)));

    expect(opening).toEqual({
      kind: "opened",
      registerId,
      registerName: "Caja 1",
      content: { deviceId, events },
    });
  });

  it("opens a ticket spread over several codes, scanned in any order", async () => {
    const events = [ticketEvent(1, { payload: { padding: randomBytes(1500).toString("hex") } })];
    const codes = sealedWith(ticketContent(registerId, deviceId, events));
    expect(codes.length).toBeGreaterThan(1);

    const opening = await opener.open([...codes].reverse());

    expect(opening).toMatchObject({ kind: "opened", content: { deviceId, events } });
  });

  it("answers unreadable when a code is not a ticket frame", async () => {
    const codes = sealedWith(ticketContent(registerId, deviceId, [ticketEvent(1)]));

    expect(await opener.open([...codes, "not a ticket"])).toEqual({ kind: "unreadable" });
  });

  it("answers incomplete when a code of the ticket is missing", async () => {
    const events = [ticketEvent(1, { payload: { padding: randomBytes(1500).toString("hex") } })];
    const codes = sealedWith(ticketContent(registerId, deviceId, events));

    expect(await opener.open(codes.slice(1))).toEqual({ kind: "incomplete" });
  });

  it("answers incomplete when the codes come from different tickets", async () => {
    const events = [ticketEvent(1, { payload: { padding: randomBytes(1500).toString("hex") } })];
    const first = sealedWith(ticketContent(registerId, deviceId, events));
    const second = sealedWith(ticketContent(registerId, deviceId, events));

    expect(await opener.open([first[0] as string, second[1] as string])).toEqual({
      kind: "incomplete",
    });
  });

  it("answers incomplete when no code was scanned", async () => {
    expect(await opener.open([])).toEqual({ kind: "incomplete" });
  });

  it("answers unknown_key when the register holds no key of the ticket's version", async () => {
    const codes = sealedWith(ticketContent(registerId, deviceId, [ticketEvent(1)]), {
      keyVersion: KEY_VERSION + 1,
    });

    expect(await opener.open(codes)).toEqual({ kind: "unknown_key" });
  });

  it("answers unknown_key when the ticket names a register that does not exist", async () => {
    const otherRegister = "6f1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a11";
    const codes = sealedTicketQrCodes({
      frameRegisterId: otherRegister,
      keyVersion: KEY_VERSION,
      key,
      content: ticketContent(otherRegister, deviceId, [ticketEvent(1)]),
    });

    expect(await opener.open(codes)).toEqual({ kind: "unknown_key" });
  });

  it("answers not_authentic when the ticket was sealed with another key", async () => {
    const codes = sealedWith(ticketContent(registerId, deviceId, [ticketEvent(1)]), {
      key: generatedKey(),
    });

    expect(await opener.open(codes)).toEqual({ kind: "not_authentic" });
  });

  it("answers not_authentic when the sealed part is not what the register's key sealed", async () => {
    const codes = contingencyBackupTicketQrCodes({
      registerId,
      keyVersion: KEY_VERSION,
      nonce: randomBytes(12),
      sealed: randomBytes(200),
    });

    expect(await opener.open(codes)).toEqual({ kind: "not_authentic" });
  });

  it("answers not_authentic when the sealed part is shorter than an authentication tag", async () => {
    const codes = contingencyBackupTicketQrCodes({
      registerId,
      keyVersion: KEY_VERSION,
      nonce: randomBytes(12),
      sealed: randomBytes(8),
    });

    expect(await opener.open(codes)).toEqual({ kind: "not_authentic" });
  });

  it("answers not_authentic when what it carries is not a ticket", async () => {
    const content = { ...ticketContent(registerId, deviceId, [ticketEvent(1)]), events: [] };

    expect(await opener.open(sealedWith(content))).toEqual({ kind: "not_authentic" });
  });

  it("answers not_authentic when what it carries is not compressed text", async () => {
    const codes = sealedPlaintextQrCodes({
      frameRegisterId: registerId,
      keyVersion: KEY_VERSION,
      key,
      plaintext: Buffer.from("this was never compressed"),
    });

    expect(await opener.open(codes)).toEqual({ kind: "not_authentic" });
  });

  it("answers not_authentic when the ticket carries events of another register", async () => {
    const other = await insertEnrolledInstallation(testDatabase.db, { now: NOW });
    const codes = sealedWith(ticketContent(other.registerId, deviceId, [ticketEvent(1)]));

    expect(await opener.open(codes)).toEqual({ kind: "not_authentic" });
  });
});
