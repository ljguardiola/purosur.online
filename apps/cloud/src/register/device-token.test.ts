import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deviceTokenRotator, hashDeviceToken, issueDeviceToken } from "./device-token.js";

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

const ROTATION_KEY = Buffer.alloc(32, 7);
const OTHER_ROTATION_KEY = Buffer.alloc(32, 8);

describe("deviceTokenRotator", () => {
  it("derives the same successor every time from the same token and key", () => {
    const { deviceToken } = issueDeviceToken();

    expect(deviceTokenRotator(ROTATION_KEY).successorOf(deviceToken)).toEqual(
      deviceTokenRotator(ROTATION_KEY).successorOf(deviceToken),
    );
  });

  it("derives a different successor for another token or another key", () => {
    const { deviceToken } = issueDeviceToken();
    const successor = deviceTokenRotator(ROTATION_KEY).successorOf(deviceToken);

    expect(
      deviceTokenRotator(ROTATION_KEY).successorOf(issueDeviceToken().deviceToken),
    ).not.toEqual(successor);
    expect(deviceTokenRotator(OTHER_ROTATION_KEY).successorOf(deviceToken)).not.toEqual(successor);
  });

  it("derives a successor shaped like an enrolled token, with the hash of the whole token", () => {
    const { deviceToken } = issueDeviceToken();

    const successor = deviceTokenRotator(ROTATION_KEY).successorOf(deviceToken);

    expect(successor.deviceToken.startsWith(`${successor.lookupPrefix}.`)).toBe(true);
    expect(successor.lookupPrefix).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const [, secret] = successor.deviceToken.split(".");
    expect(Buffer.from(secret ?? "", "base64url").length).toBe(32);
    expect(successor.tokenHash).toBe(hashDeviceToken(successor.deviceToken));
  });

  it("reads the lookup prefix and hash of a well-formed token", () => {
    const { deviceToken, lookupPrefix, tokenHash } = issueDeviceToken();

    expect(deviceTokenRotator(ROTATION_KEY).read(deviceToken)).toEqual({ lookupPrefix, tokenHash });
  });

  it.each([
    ["an empty string", ""],
    ["a token without a separator", "abcdef"],
    ["a token without its lookup prefix", ".secret"],
    ["a token without its secret", "prefix."],
    ["a token with a third part", "prefix.secret.extra"],
    ["a token with characters outside base64url", "pre fix.sec+ret"],
  ])("does not read %s", (_case, deviceToken) => {
    expect(deviceTokenRotator(ROTATION_KEY).read(deviceToken)).toBeUndefined();
  });
});
