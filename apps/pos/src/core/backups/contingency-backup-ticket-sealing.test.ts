import { createDecipheriv, randomBytes } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  contingencyBackupTicketAssociatedData,
  contingencyBackupTicketContentSchema,
  joinContingencyBackupTicketParts,
  readContingencyBackupTicketQrCode,
} from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteLocalOutbox } from "../sync/sqlite-local-outbox";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import {
  appendOutboxEvents,
  CHAIN_KEY,
  openOutboxDatabase,
  outboxEventDraft,
} from "../sync/test-support/sqlite-local-outbox";
import { createContingencyBackupTicketSealer } from "./contingency-backup-ticket-sealing";

const REGISTER_ID = "018f0000-0000-7000-8000-00000000aaaa";
const KEY = randomBytes(32);
const TAG_BYTES = 16;

let database: LocalDatabase;

function sealerWith(key: { version: number; key: string } | undefined) {
  return createContingencyBackupTicketSealer({
    database,
    outbox: new SqliteLocalOutbox(database, () => new Date("2026-10-01T09:30:00.000Z")),
    readContingencyTicketKey: async () => key,
    appVersion: "1.4.0",
  });
}

function opened(texts: string[]): { sealed: Uint8Array; keyVersion: number; nonce: Uint8Array } {
  const parts = texts.map((text) => {
    const part = readContingencyBackupTicketQrCode(text);
    if (part === null) throw new Error("test setup: unreadable QR text");
    return part;
  });
  const sealed = joinContingencyBackupTicketParts(parts);
  const [first] = parts;
  if (sealed === null || first === undefined) throw new Error("test setup: parts do not join");
  return { sealed, keyVersion: first.keyVersion, nonce: first.nonce };
}

function decrypted(texts: string[], key = KEY): unknown {
  const { sealed, keyVersion, nonce } = opened(texts);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(
    contingencyBackupTicketAssociatedData({ registerId: REGISTER_ID, keyVersion, nonce }),
  );
  decipher.setAuthTag(sealed.slice(sealed.length - TAG_BYTES));
  const compressed = Buffer.concat([
    decipher.update(sealed.slice(0, sealed.length - TAG_BYTES)),
    decipher.final(),
  ]);
  return JSON.parse(inflateRawSync(compressed).toString("utf8"));
}

beforeEach(() => {
  database = openOutboxDatabase();
  database
    .prepare("INSERT INTO own_register (id, name, version, removed) VALUES (?, 'Caja 1', 1, 0)")
    .run(REGISTER_ID);
});

afterEach(() => {
  database.close();
});

describe("sealing the events of an operation", () => {
  it("seals them so that the key opens exactly the content, with the version of the key", async () => {
    appendOutboxEvents(database, 4);

    const sealing = await sealerWith({ version: 3, key: KEY.toString("base64") }).seal("ticket-1", {
      firstDeviceSeq: 2,
      lastDeviceSeq: 3,
    });

    if (sealing.kind !== "sealed") throw new Error(`expected a sealed ticket, got ${sealing.kind}`);
    expect(sealing.keyVersion).toBe(3);
    const content = contingencyBackupTicketContentSchema.parse(decrypted(sealing.qrCodes));
    expect(content).toMatchObject({
      format: 1,
      register_id: REGISTER_ID,
      device_id: "device-a",
      app_version: "1.4.0",
    });
    expect(content.events.map((event) => event.device_seq)).toEqual([2, 3]);
    expect(content.events[0]).toMatchObject({
      ...outboxEventDraft(2),
      chain_hmac: expect.any(String),
    });
    expect(opened(sealing.qrCodes).keyVersion).toBe(3);
  });

  it("uses a new nonce for every ticket", async () => {
    appendOutboxEvents(database, 2);
    const sealer = sealerWith({ version: 1, key: KEY.toString("base64") });

    const first = await sealer.seal("ticket-1", { firstDeviceSeq: 1, lastDeviceSeq: 2 });
    const second = await sealer.seal("ticket-2", { firstDeviceSeq: 1, lastDeviceSeq: 2 });

    if (first.kind !== "sealed" || second.kind !== "sealed") throw new Error("expected sealed");
    expect(opened(first.qrCodes).nonce).not.toEqual(opened(second.qrCodes).nonce);
  });

  it("cannot be opened once a part is tampered with", async () => {
    appendOutboxEvents(database, 2);
    const sealing = await sealerWith({ version: 1, key: KEY.toString("base64") }).seal("ticket-1", {
      firstDeviceSeq: 1,
      lastDeviceSeq: 2,
    });
    if (sealing.kind !== "sealed") throw new Error("expected sealed");
    const [text] = sealing.qrCodes;
    if (text === undefined) throw new Error("test setup: no QR text");
    const flipped = text.slice(0, -2) + (text.endsWith("AA") ? "BB" : "AA");

    expect(() => decrypted([flipped, ...sealing.qrCodes.slice(1)])).toThrow();
  });

  it("cannot be opened with another key", async () => {
    appendOutboxEvents(database, 2);
    const sealing = await sealerWith({ version: 1, key: KEY.toString("base64") }).seal("ticket-1", {
      firstDeviceSeq: 1,
      lastDeviceSeq: 2,
    });
    if (sealing.kind !== "sealed") throw new Error("expected sealed");

    expect(() => decrypted(sealing.qrCodes, randomBytes(32))).toThrow();
  });

  it("splits a large operation into several QR texts that join back to the one ticket", async () => {
    for (let number = 1; number <= 6; number += 1) {
      appendOutboxEvent(database, CHAIN_KEY, {
        ...outboxEventDraft(number),
        payload: { filler: randomBytes(900).toString("hex") },
      });
    }

    const sealing = await sealerWith({ version: 1, key: KEY.toString("base64") }).seal("ticket-1", {
      firstDeviceSeq: 1,
      lastDeviceSeq: 6,
    });

    if (sealing.kind !== "sealed") throw new Error("expected sealed");
    expect(sealing.qrCodes.length).toBeGreaterThan(1);
    const reversed = [...sealing.qrCodes].reverse();
    const content = contingencyBackupTicketContentSchema.parse(decrypted(reversed));
    expect(content.events).toHaveLength(6);
  });

  it("holds nothing to seal without the key", async () => {
    appendOutboxEvents(database, 2);

    expect(
      await sealerWith(undefined).seal("ticket-1", { firstDeviceSeq: 1, lastDeviceSeq: 2 }),
    ).toEqual({ kind: "no_key" });
  });

  it("refuses to seal a range that holds no event", async () => {
    appendOutboxEvents(database, 2);

    await expect(
      sealerWith({ version: 1, key: KEY.toString("base64") }).seal("ticket-1", {
        firstDeviceSeq: 5,
        lastDeviceSeq: 6,
      }),
    ).rejects.toThrow();
  });
});
