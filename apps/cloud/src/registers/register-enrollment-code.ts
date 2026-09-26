import { createHash, randomBytes } from "node:crypto";

// RFC 4648 §6's base32 alphabet, uppercase.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * RFC 4648 base32, without the trailing `=` padding: a bit accumulator emits one alphabet
 * character per full 5-bit group, padding a final partial group with zero bits the same way the
 * padded form does before it would add `=` characters. Every caller in this codebase only ever
 * passes a byte count that is already a multiple of 5 bits (10 bytes, see
 * `REGISTER_ENROLLMENT_CODE_BYTES` below), so no partial group — and no padding decision — is ever
 * actually reached.
 */
export function base32Encode(bytes: Buffer): string {
  let bitBuffer = 0;
  let bitCount = 0;
  let encoded = "";

  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      encoded += BASE32_ALPHABET[(bitBuffer >> bitCount) & 0b11111];
    }
  }
  if (bitCount > 0) {
    encoded += BASE32_ALPHABET[(bitBuffer << (5 - bitCount)) & 0b11111];
  }

  return encoded;
}

/** 80 bits of CSPRNG entropy, RFC 4648 base32's exact encoding of 10 bytes (80 is a multiple of 5, so no padding). */
const REGISTER_ENROLLMENT_CODE_BYTES = 10;
export const REGISTER_ENROLLMENT_CODE_LENGTH = 16;

/**
 * A fresh register enrollment code: 80 bits of CSPRNG randomness (`node:crypto`'s `randomBytes`),
 * rendered as 16 base32 characters. The backoffice displays it grouped in fours; this returns it
 * ungrouped, the same "raw form, caller decides how to render it" shape `generateSessionId` gives
 * its own raw id. This is the only place the raw code ever exists outside the person copying it off
 * the backoffice screen: `registerEnrollmentCodes.codeHash` stores only its hash (
 * `hashRegisterEnrollmentCode` below).
 */
export function generateRegisterEnrollmentCode(): string {
  return base32Encode(randomBytes(REGISTER_ENROLLMENT_CODE_BYTES));
}

/**
 * SHA-256 of the raw enrollment code, base64url-encoded the same way `hashSessionId` and
 * `hashRecoveryToken` hash their own secrets: the only form the cloud ever stores or looks a code
 * up by. The audit row an emitted code writes never carries the code or this hash.
 */
export function hashRegisterEnrollmentCode(rawCode: string): string {
  return createHash("sha256").update(rawCode).digest("base64url");
}
