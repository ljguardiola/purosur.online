import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FIRST_KEY_VERSION,
  INSTALLATION_KEY_BYTES,
  inVersionOrder,
  isWellFormedInstallationKey,
  latestKey,
} from "./installation-key.js";

const base64Of = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

describe("isWellFormedInstallationKey", () => {
  it("holds 256 bits", () => {
    expect(INSTALLATION_KEY_BYTES * 8).toBe(256);
  });

  it("accepts every 256-bit key in standard padded base64", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: INSTALLATION_KEY_BYTES, maxLength: INSTALLATION_KEY_BYTES }),
        (bytes) => isWellFormedInstallationKey(base64Of(bytes)),
      ),
    );
  });

  it.each([
    ["one byte short", INSTALLATION_KEY_BYTES - 1],
    ["one byte long", INSTALLATION_KEY_BYTES + 1],
    ["empty", 0],
  ])("rejects a key %s", (_case, length) => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: length, maxLength: length }), (bytes) => {
        expect(isWellFormedInstallationKey(base64Of(bytes))).toBe(false);
      }),
    );
  });

  it("rejects a 256-bit key written without its padding", () => {
    expect(isWellFormedInstallationKey(base64Of(new Uint8Array(32).fill(7)).slice(0, -1))).toBe(
      false,
    );
  });

  it("rejects a 256-bit key in the URL-safe alphabet", () => {
    const key = base64Of(new Uint8Array(32).fill(0xfb));

    expect(isWellFormedInstallationKey(key.replaceAll("+", "-").replaceAll("/", "_"))).toBe(false);
  });

  it("rejects text around a well-formed key", () => {
    const key = base64Of(new Uint8Array(32).fill(1));

    expect(isWellFormedInstallationKey(` ${key}`)).toBe(false);
    expect(isWellFormedInstallationKey(`${key} `)).toBe(false);
  });

  it("rejects a key whose last character carries bits beyond the 256", () => {
    const key = base64Of(new Uint8Array(32));

    expect(key.at(-2)).toBe("A");
    expect(isWellFormedInstallationKey(`${key.slice(0, -2)}B=`)).toBe(false);
  });
});

describe("latestKey", () => {
  it("is the key with the highest version, whatever the order it comes in", () => {
    expect(
      latestKey([
        { version: 2, key: "second" },
        { version: 3, key: "third" },
        { version: 1, key: "first" },
      ]),
    ).toEqual({ version: 3, key: "third" });
  });

  it("is nothing when no key was generated yet", () => {
    expect(latestKey([])).toBeUndefined();
  });
});

describe("inVersionOrder", () => {
  it("lists the keys from the oldest version to the newest, leaving its input as it was", () => {
    const keys = [
      { version: 3, key: "third" },
      { version: 1, key: "first" },
      { version: 2, key: "second" },
    ];

    expect(inVersionOrder(keys)).toEqual([
      { version: 1, key: "first" },
      { version: 2, key: "second" },
      { version: 3, key: "third" },
    ]);
    expect(keys[0]).toEqual({ version: 3, key: "third" });
  });
});

describe("FIRST_KEY_VERSION", () => {
  it("numbers a register's first key 1", () => {
    expect(FIRST_KEY_VERSION).toBe(1);
  });
});
