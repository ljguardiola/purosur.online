import { createHash, randomBytes } from "node:crypto";
import type { IssuedDeviceToken } from "@purosur/domain/register/use-cases";

const LOOKUP_PREFIX_BYTES = 12;
const SECRET_BYTES = 32;

export function hashDeviceToken(deviceToken: string): string {
  return createHash("sha256").update(deviceToken).digest("base64url");
}

// The raw token exists only in this response to the installation; the cloud keeps its hash.
export function issueDeviceToken(): IssuedDeviceToken {
  const lookupPrefix = randomBytes(LOOKUP_PREFIX_BYTES).toString("base64url");
  const deviceToken = `${lookupPrefix}.${randomBytes(SECRET_BYTES).toString("base64url")}`;
  return { deviceToken, lookupPrefix, tokenHash: hashDeviceToken(deviceToken) };
}
