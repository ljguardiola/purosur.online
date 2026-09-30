import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { base32EncodeUnpadded } from "../platform/base32.js";

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
