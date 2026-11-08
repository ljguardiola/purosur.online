import { describe, expect, it } from "vitest";
import { installationKeysSchema } from "./installation-keys.js";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const KEY_C = Buffer.alloc(32, 3).toString("base64");

const VALID = {
  snapshot_key_versions: [
    { version: 1, key: KEY_A },
    { version: 2, key: KEY_B },
  ],
  contingency_ticket_key: { version: 1, key: KEY_C },
  outbox_chain_key: KEY_A,
};

function accepts(body: unknown): boolean {
  return installationKeysSchema.safeParse(body).success;
}

describe("installationKeysSchema", () => {
  it("carries every snapshot key version, the contingency-ticket key and the outbox-chain key", () => {
    expect(installationKeysSchema.parse(VALID)).toEqual(VALID);
  });

  it.each(["snapshot_key_versions", "contingency_ticket_key", "outbox_chain_key"])(
    "rejects keys without %s",
    (field) => {
      const body: Record<string, unknown> = { ...VALID };
      delete body[field];

      expect(accepts(body)).toBe(false);
    },
  );

  it("rejects keys without any snapshot key version", () => {
    expect(accepts({ ...VALID, snapshot_key_versions: [] })).toBe(false);
  });

  it("rejects two snapshot keys under the same version", () => {
    expect(
      accepts({
        ...VALID,
        snapshot_key_versions: [
          { version: 1, key: KEY_A },
          { version: 1, key: KEY_B },
        ],
      }),
    ).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["text", "1"],
  ])("rejects a %s key version", (_case, version) => {
    expect(accepts({ ...VALID, contingency_ticket_key: { version, key: KEY_C } })).toBe(false);
    expect(accepts({ ...VALID, snapshot_key_versions: [{ version, key: KEY_A }] })).toBe(false);
  });

  it.each([
    ["shorter than 256 bits", Buffer.alloc(31, 1).toString("base64")],
    ["not base64", "not a key"],
    ["not text", 7],
  ])("rejects a key %s", (_case, key) => {
    expect(accepts({ ...VALID, outbox_chain_key: key })).toBe(false);
    expect(accepts({ ...VALID, contingency_ticket_key: { version: 1, key } })).toBe(false);
    expect(accepts({ ...VALID, snapshot_key_versions: [{ version: 1, key }] })).toBe(false);
  });
});
