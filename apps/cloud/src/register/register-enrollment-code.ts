import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const RFC4648_BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32EncodeUnpadded(bytes: Buffer): string {
  let bitBuffer = 0;
  let bitCount = 0;
  let encoded = "";

  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      encoded += RFC4648_BASE32_ALPHABET[(bitBuffer >> bitCount) & 0b11111];
    }
  }
  if (bitCount > 0) {
    encoded += RFC4648_BASE32_ALPHABET[(bitBuffer << (5 - bitCount)) & 0b11111];
  }

  return encoded;
}

// 10 bytes is a multiple of 5 bits, so the base32 encoding below needs no padding.
const REGISTER_ENROLLMENT_CODE_BYTES = 10;

// The only place the raw code exists outside the backoffice screen; only its hash is ever stored.
export function generateRegisterEnrollmentCode(): string {
  return base32EncodeUnpadded(randomBytes(REGISTER_ENROLLMENT_CODE_BYTES));
}

export function hashRegisterEnrollmentCode(rawCode: string): string {
  return createHash("sha256").update(rawCode).digest("base64url");
}

export function registerEnrollmentCodeMatches(rawCode: string, codeHash: string): boolean {
  const presented = Buffer.from(hashRegisterEnrollmentCode(rawCode));
  const stored = Buffer.from(codeHash);
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
