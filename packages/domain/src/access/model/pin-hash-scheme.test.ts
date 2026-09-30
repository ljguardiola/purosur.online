import { argon2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PIN_HASH_SCHEME } from "./pin-hash-scheme.js";

function hashPin(pin: string, salt: Buffer): string {
  const { encoding, saltLength: _saltLength, algorithm, ...parameters } = PIN_HASH_SCHEME;
  return argon2Sync(algorithm, { message: pin, nonce: salt, ...parameters }).toString(encoding);
}

describe("PIN_HASH_SCHEME", () => {
  it("hashes PIN 123456 with a salt of sixteen 0x01 bytes to the known base64url hash", () => {
    expect(hashPin("123456", Buffer.alloc(16, 1))).toBe(
      "FO3oOFk5tY4DPtoNNGl7KXTcZfn77pjiKvugqG5Dm-E",
    );
  });

  it("encodes a hash that decodes back to 32 bytes", () => {
    const hash = hashPin("123456", Buffer.alloc(PIN_HASH_SCHEME.saltLength, 1));

    expect(Buffer.from(hash, PIN_HASH_SCHEME.encoding)).toHaveLength(32);
  });

  it("gives the same PIN different hashes under different salts", () => {
    expect(hashPin("123456", Buffer.alloc(16, 2))).not.toBe(hashPin("123456", Buffer.alloc(16, 1)));
  });
});
