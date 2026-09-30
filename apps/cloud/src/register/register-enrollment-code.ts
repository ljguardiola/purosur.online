import { timingSafeEqual } from "node:crypto";
import { hashSecretCode } from "../platform/secret-code.js";

export function registerEnrollmentCodeMatches(rawCode: string, codeHash: string): boolean {
  const presented = Buffer.from(hashSecretCode(rawCode));
  const stored = Buffer.from(codeHash);
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
