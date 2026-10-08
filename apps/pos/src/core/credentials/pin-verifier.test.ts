import { describe, expect, it } from "vitest";
import { derivePinVerifier } from "./pin-verifier";

describe("a PIN verifier", () => {
  it("is the HMAC-SHA256 of the PIN hash keyed with the pepper's bytes, in base64url", () => {
    const pepper = Buffer.from("Jefe").toString("base64url");

    expect(derivePinVerifier(pepper, "what do ya want for nothing?")).toBe(
      Buffer.from(
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
        "hex",
      ).toString("base64url"),
    );
  });

  it("differs for another pepper or another PIN hash", () => {
    const pepper = Buffer.alloc(32, 1).toString("base64url");
    const other = Buffer.alloc(32, 2).toString("base64url");

    expect(derivePinVerifier(pepper, "hash")).not.toBe(derivePinVerifier(other, "hash"));
    expect(derivePinVerifier(pepper, "hash")).not.toBe(derivePinVerifier(pepper, "other hash"));
  });
});
