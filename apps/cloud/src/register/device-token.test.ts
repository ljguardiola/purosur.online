import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashDeviceToken, issueDeviceToken } from "./device-token.js";

describe("issueDeviceToken", () => {
  it("issues a token whose secret part carries at least 256 random bits", () => {
    const { deviceToken } = issueDeviceToken();
    const [, secret] = deviceToken.split(".");

    expect(Buffer.from(secret ?? "", "base64url").length).toBeGreaterThanOrEqual(32);
  });

  it("starts the token with its lookup prefix, so the prefix alone finds its row", () => {
    const { deviceToken, lookupPrefix } = issueDeviceToken();

    expect(deviceToken.startsWith(`${lookupPrefix}.`)).toBe(true);
    expect(lookupPrefix).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("keeps only the SHA-256 hash of the whole token", () => {
    const { deviceToken, tokenHash } = issueDeviceToken();

    expect(tokenHash).toBe(createHash("sha256").update(deviceToken).digest("base64url"));
    expect(tokenHash).toBe(hashDeviceToken(deviceToken));
  });

  it("issues a different token, prefix and hash every time", () => {
    const first = issueDeviceToken();
    const second = issueDeviceToken();

    expect(second.deviceToken).not.toBe(first.deviceToken);
    expect(second.lookupPrefix).not.toBe(first.lookupPrefix);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });
});
