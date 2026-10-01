import { timingSafeEqual } from "node:crypto";
import type { EnrollmentCodeIssuer } from "@purosur/domain/register/use-cases";
import { generateSecretCode, hashSecretCode } from "../platform/secret-code.js";

export function registerEnrollmentCodeMatches(rawCode: string, codeHash: string): boolean {
  const presented = Buffer.from(hashSecretCode(rawCode));
  const stored = Buffer.from(codeHash);
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

export const secretEnrollmentCodes: EnrollmentCodeIssuer = {
  issue() {
    const code = generateSecretCode();
    return { code, codeHash: hashSecretCode(code) };
  },
};
