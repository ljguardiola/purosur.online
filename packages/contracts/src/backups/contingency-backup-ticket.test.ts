import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { base45Decode, base45Encode } from "./base45.js";
import {
  CONTINGENCY_BACKUP_QR_MAX_BYTES,
  contingencyBackupTicketAssociatedData,
  contingencyBackupTicketContentSchema,
  contingencyBackupTicketQrCodes,
  joinContingencyBackupTicketParts,
  readContingencyBackupTicketQrCode,
} from "./contingency-backup-ticket.js";

const REGISTER_ID = "0b1f3c52-8d4e-4a6b-9c27-5e8f1a2d3b4c";
const REGISTER_BYTES = [
  0x0b, 0x1f, 0x3c, 0x52, 0x8d, 0x4e, 0x4a, 0x6b, 0x9c, 0x27, 0x5e, 0x8f, 0x1a, 0x2d, 0x3b, 0x4c,
];
const NONCE = Uint8Array.from({ length: 12 }, (_, index) => index + 100);
const HEADER_BYTES = 35;
const MAX_CHUNK_BYTES = CONTINGENCY_BACKUP_QR_MAX_BYTES - HEADER_BYTES;

function sealedOf(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 7 + 3) % 256);
}

function codesOf(sealed: Uint8Array, overrides: { registerId?: string; keyVersion?: number } = {}) {
  return contingencyBackupTicketQrCodes({
    registerId: REGISTER_ID,
    keyVersion: 3,
    nonce: NONCE,
    sealed,
    ...overrides,
  });
}

function partsOf(codes: string[]) {
  return codes.map((code) => {
    const part = readContingencyBackupTicketQrCode(code);
    if (part === null) throw new Error("unreadable code");
    return part;
  });
}

describe("contingencyBackupTicketContentSchema", () => {
  const event = {
    event_id: "7d9c2b64-1f3a-4e85-b6d0-3a9e5c1f8b27",
    device_seq: 4,
    aggregate_type: "sale",
    aggregate_id: "sale-1",
    event_type: "sale_completed",
    schema_version: 1,
    payload: { total_cents: 1500 },
    occurred_at: "2026-10-14T15:00:00.000Z",
    actor_id: "user-1",
    chain_hmac: "abc123",
  };
  const content = {
    format: 1,
    register_id: REGISTER_ID,
    device_id: "device-1",
    app_version: "1.4.0",
    events: [event],
  };

  it("accepts the events of a register's operation", () => {
    expect(contingencyBackupTicketContentSchema.parse(content)).toEqual(content);
  });

  it.each([
    ["another format", { format: 2 }],
    ["a register id that is not a uuid", { register_id: "register-1" }],
    ["an empty device id", { device_id: "" }],
    ["an empty app version", { app_version: "" }],
    ["no events", { events: [] }],
    ["an event that is not a pushed event", { events: [{ ...event, device_seq: 0 }] }],
  ])("refuses %s", (_name, override) => {
    expect(
      contingencyBackupTicketContentSchema.safeParse({ ...content, ...override }).success,
    ).toBe(false);
  });
});

describe("CONTINGENCY_BACKUP_QR_MAX_BYTES", () => {
  it("is the bytes of one QR code", () => {
    expect(CONTINGENCY_BACKUP_QR_MAX_BYTES).toBe(640);
  });
});

describe("contingencyBackupTicketAssociatedData", () => {
  it("is the format, register id, key version and nonce", () => {
    const data = contingencyBackupTicketAssociatedData({
      registerId: REGISTER_ID,
      keyVersion: 0x01020304,
      nonce: NONCE,
    });

    expect([...data]).toEqual([1, ...REGISTER_BYTES, 1, 2, 3, 4, ...NONCE]);
  });

  it("writes the key version of the largest value", () => {
    const data = contingencyBackupTicketAssociatedData({
      registerId: REGISTER_ID,
      keyVersion: 0xffffffff,
      nonce: NONCE,
    });

    expect([...data.slice(17, 21)]).toEqual([255, 255, 255, 255]);
  });

  it("reads an upper case register id as the same bytes", () => {
    const data = contingencyBackupTicketAssociatedData({
      registerId: REGISTER_ID.toUpperCase(),
      keyVersion: 1,
      nonce: NONCE,
    });

    expect([...data.slice(1, 17)]).toEqual(REGISTER_BYTES);
  });

  it.each([
    ["a register id that is not a uuid", { registerId: "register-1" }],
    ["a negative key version", { keyVersion: -1 }],
    ["a key version past 32 bits", { keyVersion: 0x100000000 }],
    ["a fractional key version", { keyVersion: 1.5 }],
    ["a nonce of 11 bytes", { nonce: new Uint8Array(11) }],
    ["a nonce of 13 bytes", { nonce: new Uint8Array(13) }],
  ])("refuses %s", (_name, override) => {
    expect(() =>
      contingencyBackupTicketAssociatedData({
        registerId: REGISTER_ID,
        keyVersion: 1,
        nonce: NONCE,
        ...override,
      }),
    ).toThrow(RangeError);
  });
});

describe("contingencyBackupTicketQrCodes", () => {
  it("writes the header, the part position and the chunk of a ticket that fits one code", () => {
    const sealed = sealedOf(50);

    const [code, ...others] = codesOf(sealed);

    expect(others).toEqual([]);
    const frame = base45Decode(code ?? "");
    expect([...(frame ?? [])]).toEqual([
      ...contingencyBackupTicketAssociatedData({
        registerId: REGISTER_ID,
        keyVersion: 3,
        nonce: NONCE,
      }),
      1,
      1,
      ...sealed,
    ]);
  });

  it("keeps a sealed ticket of the largest chunk in one code and splits one byte more", () => {
    expect(codesOf(sealedOf(MAX_CHUNK_BYTES))).toHaveLength(1);
    expect(codesOf(sealedOf(MAX_CHUNK_BYTES + 1))).toHaveLength(2);
    expect(codesOf(sealedOf(MAX_CHUNK_BYTES * 2))).toHaveLength(2);
    expect(codesOf(sealedOf(MAX_CHUNK_BYTES * 2 + 1))).toHaveLength(3);
  });

  it("numbers the parts from one", () => {
    const parts = partsOf(codesOf(sealedOf(MAX_CHUNK_BYTES * 2 + 1)));

    expect(parts.map((part) => [part.partIndex, part.partCount])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("fits every frame in a QR code, for any ticket", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20_000 }), (length) => {
        for (const code of codesOf(sealedOf(length))) {
          expect(code.length).toBeLessThanOrEqual(960);
          expect(base45Decode(code)?.length).toBeLessThanOrEqual(CONTINGENCY_BACKUP_QR_MAX_BYTES);
        }
      }),
    );
  });

  it("joins back to the sealed bytes, for any ticket", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 4_000 }), (sealed) => {
        const joined = joinContingencyBackupTicketParts(partsOf(codesOf(sealed)));

        expect(joined).toEqual(sealed);
      }),
    );
  });

  it("refuses a ticket that needs more than 255 parts", () => {
    expect(() => codesOf(sealedOf(MAX_CHUNK_BYTES * 255 + 1))).toThrow(RangeError);
    expect(codesOf(sealedOf(MAX_CHUNK_BYTES * 255))).toHaveLength(255);
  });
});

describe("readContingencyBackupTicketQrCode", () => {
  it("reads back the register, key version, nonce, position and chunk", () => {
    const sealed = sealedOf(MAX_CHUNK_BYTES + 10);

    const [, second] = partsOf(codesOf(sealed, { keyVersion: 0xfffffffe }));

    expect(second).toEqual({
      registerId: REGISTER_ID,
      keyVersion: 0xfffffffe,
      nonce: NONCE,
      partIndex: 2,
      partCount: 2,
      chunk: sealed.slice(MAX_CHUNK_BYTES),
    });
  });

  it("reads an empty chunk", () => {
    const frame = base45Decode(codesOf(sealedOf(1))[0] ?? "");
    const header = frame?.slice(0, HEADER_BYTES) ?? new Uint8Array();

    expect(readContingencyBackupTicketQrCode(base45Encode(header))?.chunk).toEqual(
      new Uint8Array(),
    );
  });

  function withFrame(change: (frame: Uint8Array) => Uint8Array): string {
    const frame = base45Decode(codesOf(sealedOf(20))[0] ?? "") ?? new Uint8Array();
    return base45Encode(change(frame));
  }

  it.each([
    ["text that is not Base45", () => "not base45"],
    ["another format byte", () => withFrame((frame) => Uint8Array.from([2, ...frame.slice(1)]))],
    ["a header cut short", () => withFrame((frame) => frame.slice(0, HEADER_BYTES - 1))],
    [
      "a part index of zero",
      () => withFrame((frame) => Uint8Array.from(frame, (byte, i) => (i === 33 ? 0 : byte))),
    ],
    [
      "a part index past the part count",
      () => withFrame((frame) => Uint8Array.from(frame, (byte, i) => (i === 33 ? 2 : byte))),
    ],
    [
      "a part count of zero",
      () =>
        withFrame((frame) => Uint8Array.from(frame, (byte, i) => (i >= 33 && i <= 34 ? 0 : byte))),
    ],
    ["nothing", () => ""],
  ])("refuses %s", (_name, text) => {
    expect(readContingencyBackupTicketQrCode(text())).toBeNull();
  });
});

describe("joinContingencyBackupTicketParts", () => {
  const sealed = sealedOf(MAX_CHUNK_BYTES * 2 + 5);
  const parts = () => partsOf(codesOf(sealed));

  it("joins the parts in any order they were read", () => {
    const [first, second, third] = parts();

    expect(
      joinContingencyBackupTicketParts(
        [third, first, second].flatMap((part) => (part ? [part] : [])),
      ),
    ).toEqual(sealed);
  });

  it("joins the one part of a small ticket", () => {
    expect(joinContingencyBackupTicketParts(partsOf(codesOf(sealedOf(9))))).toEqual(sealedOf(9));
  });

  it("refuses no parts", () => {
    expect(joinContingencyBackupTicketParts([])).toBeNull();
  });

  it("refuses a part missing", () => {
    const [first, , third] = parts();

    expect(
      joinContingencyBackupTicketParts([first, third].flatMap((p) => (p ? [p] : []))),
    ).toBeNull();
  });

  it("refuses a part read twice", () => {
    const [first, second, third] = parts();

    expect(
      joinContingencyBackupTicketParts(
        [first, second, second, third].flatMap((p) => (p ? [p] : [])),
      ),
    ).toBeNull();
  });

  it.each([
    ["register", { registerId: "7d9c2b64-1f3a-4e85-b6d0-3a9e5c1f8b27" }],
    ["key version", { keyVersion: 4 }],
    ["nonce", { nonce: new Uint8Array(12) }],
    ["part count", { partCount: 4 }],
  ])("refuses parts of another %s", (_name, override) => {
    const [first, second, third] = parts();
    if (!first || !second || !third) throw new Error("expected three parts");

    expect(joinContingencyBackupTicketParts([first, { ...second, ...override }, third])).toBeNull();
  });
});
