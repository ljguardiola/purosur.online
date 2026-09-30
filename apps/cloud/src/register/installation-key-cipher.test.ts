import { describe, expect, it } from "vitest";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { generateInstallationKey } from "./installation-key.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

const cipher = installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY);

describe("installationKeyCipher", () => {
  it("opens what it sealed for the same purpose", () => {
    const key = generateInstallationKey();

    expect(cipher.open(cipher.seal(key, "row-a"), "row-a")).toBe(key);
  });

  it("does not store the key it seals", () => {
    const key = generateInstallationKey();

    expect(cipher.seal(key, "row-a")).not.toContain(key);
  });

  it("seals the same key differently every time", () => {
    const key = generateInstallationKey();

    expect(cipher.seal(key, "row-a")).not.toBe(cipher.seal(key, "row-a"));
  });

  it("refuses to open a sealed key for a purpose other than the one it was sealed for", () => {
    expect(() => cipher.open(cipher.seal(generateInstallationKey(), "row-a"), "row-b")).toThrow(
      "an installation key could not be decrypted",
    );
  });

  it("refuses to open a sealed key under another encryption key", () => {
    const sealed = cipher.seal(generateInstallationKey(), "row-a");
    const other = installationKeyCipher(Buffer.alloc(32, 8));

    expect(() => other.open(sealed, "row-a")).toThrow("an installation key could not be decrypted");
  });

  it.each([
    ["tampered", (sealed: string) => `${sealed.slice(0, -4)}AAAA`],
    ["truncated", (sealed: string) => sealed.slice(0, 10)],
    ["plaintext", () => generateInstallationKey()],
  ])("refuses to open a %s value, raising an error that repeats none of it", (_what, damage) => {
    const damaged = damage(cipher.seal(generateInstallationKey(), "row-a"));

    expect(() => cipher.open(damaged, "row-a")).toThrow(
      /^an installation key could not be decrypted$/,
    );
  });

  it.each([4, 8, 12])(
    "refuses to open a value whose authentication tag was cut to %i bytes",
    (tagBytes) => {
      const sealed = Buffer.from(cipher.seal("", "row-a"), "base64");
      const cut = sealed.subarray(0, 12 + tagBytes).toString("base64");

      expect(() => cipher.open(cut, "row-a")).toThrow(
        /^an installation key could not be decrypted$/,
      );
    },
  );

  it("refuses an encryption key that is not 32 bytes", () => {
    expect(() => installationKeyCipher(Buffer.alloc(16, 7))).toThrow(
      "the installation-keys encryption key must hold exactly 32 bytes",
    );
  });
});
