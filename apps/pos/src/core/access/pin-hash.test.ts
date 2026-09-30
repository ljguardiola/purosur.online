import { describe, expect, it, vi } from "vitest";
import { hashPin } from "./pin-hash";

vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>();
  return {
    ...original,
    argon2: () => {
      throw Object.assign(new Error("Argon2 is not supported by BoringSSL"), {
        code: "ERR_CRYPTO_ARGON2_NOT_SUPPORTED",
      });
    },
  };
});

const SALT = new Uint8Array(16).fill(1);

describe("hashing a PIN", () => {
  it("matches the known answer of the PIN hash scheme even where Node's argon2 is unsupported", async () => {
    expect(await hashPin("123456", SALT)).toBe("FO3oOFk5tY4DPtoNNGl7KXTcZfn77pjiKvugqG5Dm-E");
  });

  it("differs for another PIN or another salt", async () => {
    const hash = await hashPin("123456", SALT);

    expect(await hashPin("123457", SALT)).not.toBe(hash);
    expect(await hashPin("123456", new Uint8Array(16).fill(2))).not.toBe(hash);
  });
});
