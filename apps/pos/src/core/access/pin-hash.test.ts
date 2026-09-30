import { describe, expect, it } from "vitest";
import { hashPin } from "./pin-hash";

const SALT = new Uint8Array(16).fill(1);

describe("hashing a PIN", () => {
  it("matches the known answer of the PIN hash scheme", async () => {
    expect(await hashPin("123456", SALT)).toBe("FO3oOFk5tY4DPtoNNGl7KXTcZfn77pjiKvugqG5Dm-E");
  });

  it("differs for another PIN or another salt", async () => {
    const hash = await hashPin("123456", SALT);

    expect(await hashPin("123457", SALT)).not.toBe(hash);
    expect(await hashPin("123456", new Uint8Array(16).fill(2))).not.toBe(hash);
  });
});
