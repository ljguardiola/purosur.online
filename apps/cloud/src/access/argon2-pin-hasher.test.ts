import { describe, expect, it } from "vitest";
import { argon2PinHasher } from "./argon2-pin-hasher.js";

describe("the argon2id PIN hasher", () => {
  it("hashes a PIN with a known salt to the reference verifier", async () => {
    const hasher = argon2PinHasher(() => Buffer.alloc(16, 1));

    const hashed = await hasher.hash("123456");

    expect(hashed).toEqual({
      salt: Buffer.alloc(16, 1).toString("base64url"),
      pinHash: "FO3oOFk5tY4DPtoNNGl7KXTcZfn77pjiKvugqG5Dm-E",
    });
  });

  it("draws a fresh 16-byte salt for every PIN", async () => {
    const hasher = argon2PinHasher();

    const first = await hasher.hash("123456");
    const second = await hasher.hash("123456");

    expect(Buffer.from(first.salt, "base64url")).toHaveLength(16);
    expect(second.salt).not.toBe(first.salt);
    expect(second.pinHash).not.toBe(first.pinHash);
  });
});
