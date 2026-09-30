import { createHash, createHmac, randomBytes } from "node:crypto";
import type { DeviceTokenRotator, IssuedDeviceToken } from "@purosur/domain/register/use-cases";

const LOOKUP_PREFIX_BYTES = 12;
const SECRET_BYTES = 32;

export function hashDeviceToken(deviceToken: string): string {
  return createHash("sha256").update(deviceToken).digest("base64url");
}

function assembleDeviceToken(lookupPrefixBytes: Buffer, secretBytes: Buffer): IssuedDeviceToken {
  const lookupPrefix = lookupPrefixBytes.toString("base64url");
  const deviceToken = `${lookupPrefix}.${secretBytes.toString("base64url")}`;
  return { deviceToken, lookupPrefix, tokenHash: hashDeviceToken(deviceToken) };
}

// The raw token exists only in this response to the installation; the cloud keeps its hash.
export function issueDeviceToken(): IssuedDeviceToken {
  return assembleDeviceToken(randomBytes(LOOKUP_PREFIX_BYTES), randomBytes(SECRET_BYTES));
}

const DEVICE_TOKEN_FORMAT = /^(?<lookupPrefix>[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/;

export function deviceTokenRotator(rotationKey: Uint8Array): DeviceTokenRotator {
  return {
    read(deviceToken) {
      const lookupPrefix = DEVICE_TOKEN_FORMAT.exec(deviceToken)?.groups?.["lookupPrefix"];
      return lookupPrefix === undefined
        ? undefined
        : { lookupPrefix, tokenHash: hashDeviceToken(deviceToken) };
    },
    successorOf(deviceToken) {
      const derived = createHmac("sha512", rotationKey).update(deviceToken).digest();
      return assembleDeviceToken(
        derived.subarray(0, LOOKUP_PREFIX_BYTES),
        derived.subarray(LOOKUP_PREFIX_BYTES, LOOKUP_PREFIX_BYTES + SECRET_BYTES),
      );
    },
  };
}
