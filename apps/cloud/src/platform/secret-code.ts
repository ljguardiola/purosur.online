import { createHash, randomBytes } from "node:crypto";
import { base32EncodeUnpadded } from "./base32.js";

const SECRET_CODE_BYTES = 10;

export function generateSecretCode(): string {
  return base32EncodeUnpadded(randomBytes(SECRET_CODE_BYTES));
}

export function hashSecretCode(code: string): string {
  return createHash("sha256").update(code).digest("base64url");
}
