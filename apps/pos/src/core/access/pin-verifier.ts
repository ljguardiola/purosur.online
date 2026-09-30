import { createHmac } from "node:crypto";

export function derivePinVerifier(pepper: string, pinHash: string): string {
  return createHmac("sha256", Buffer.from(pepper, "base64url")).update(pinHash).digest("base64url");
}
