import type { GeneratedPinCode } from "@purosur/domain/credentials/use-cases";
import { generateSecretCode, hashSecretCode } from "../platform/secret-code.js";

export function generatePinCode(): GeneratedPinCode {
  const code = generateSecretCode();
  return { code, codeHash: hashSecretCode(code) };
}
