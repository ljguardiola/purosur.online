import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSessionId, hashSessionId } from "./session-id.js";

describe("generateSessionId", () => {
  it("generates a fresh, unguessable id on every call", () => {
    const first = generateSessionId();
    const second = generateSessionId();

    expect(first).not.toBe(second);
  });

  it("generates at least 256 bits (32 bytes) of randomness", () => {
    const id = generateSessionId();

    expect(Buffer.from(id, "base64url").length).toBeGreaterThanOrEqual(32);
  });
});

describe("hashSessionId", () => {
  it("hashes the raw session id with SHA-256, base64url-encoded", () => {
    expect(hashSessionId("a-raw-session-id")).toBe(
      createHash("sha256").update("a-raw-session-id").digest("base64url"),
    );
  });

  it("hashes the same input identically every time", () => {
    const id = generateSessionId();

    expect(hashSessionId(id)).toBe(hashSessionId(id));
  });
});
