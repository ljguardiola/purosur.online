import { createHash, randomBytes } from "node:crypto";

// RFC 4648 base32 alphabet, uppercase.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// RFC 4648 base32, no `=` padding. Every caller here passes a byte count already a multiple of 5
// bits (10 bytes), so the partial-group branch below is never actually reached.
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

// 80 bits of CSPRNG entropy (10 bytes), a multiple of 5 bits so base32 needs no padding.
const REGISTER_ENROLLMENT_CODE_BYTES = 10;
export const REGISTER_ENROLLMENT_CODE_LENGTH = 16;

// The only place the raw code exists outside the backoffice screen; only its hash is ever stored
// (hashRegisterEnrollmentCode below).
export function generateRegisterEnrollmentCode(): string {
  return base32Encode(randomBytes(REGISTER_ENROLLMENT_CODE_BYTES));
}

export function hashRegisterEnrollmentCode(rawCode: string): string {
  return createHash("sha256").update(rawCode).digest("base64url");
}
