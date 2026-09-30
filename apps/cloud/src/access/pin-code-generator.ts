import { createHash, randomBytes } from "node:crypto";
import type { GeneratedPinCode } from "@purosur/domain/access/use-cases";
import { base32EncodeUnpadded } from "../platform/base32.js";

// 10 bytes is a multiple of 5 bits, so the base32 encoding needs no padding.
const PIN_CODE_BYTES = 10;

export function hashPinCode(code: string): string {
  return createHash("sha256").update(code).digest("base64url");
}

export function generatePinCode(): GeneratedPinCode {
  const code = base32EncodeUnpadded(randomBytes(PIN_CODE_BYTES));
  return { code, codeHash: hashPinCode(code) };
}
