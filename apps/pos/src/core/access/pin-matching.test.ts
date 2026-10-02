import { describe, expect, it } from "vitest";
import { hashPin } from "./pin-hash";
import { createPinMatching } from "./pin-matching";
import { derivePinVerifier } from "./pin-verifier";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const SALT = new Uint8Array(16).fill(1);
const PIN_HASH = "hash-of-the-right-pin";

function matchingWith(options: { pepper?: string | undefined } = {}) {
  const hashed: { pin: string; salt: Uint8Array }[] = [];
  const matching = createPinMatching({
    readPepper: async () => ("pepper" in options ? options.pepper : PEPPER),
    hashPin: async (pin, salt) => {
      hashed.push({ pin, salt });
      return pin === "1234" ? PIN_HASH : "hash-of-another-pin";
    },
  });
  return { matching, hashed };
}

const credential = { salt: SALT, verifier: derivePinVerifier(PEPPER, PIN_HASH) };

describe("matching a PIN against a person's credential", () => {
  it("matches the right PIN", async () => {
    const matcher = await matchingWith().matching.matcher();

    expect(await matcher?.matches("1234", credential)).toBe(true);
  });

  it("does not match a wrong PIN", async () => {
    const matcher = await matchingWith().matching.matcher();

    expect(await matcher?.matches("9999", credential)).toBe(false);
  });

  it("hashes the PIN with the salt of the credential", async () => {
    const { matching, hashed } = matchingWith();

    await (await matching.matcher())?.matches("1234", credential);

    expect(hashed).toEqual([{ pin: "1234", salt: SALT }]);
  });

  it("does not match a stored verifier of another length, without failing", async () => {
    const matcher = await matchingWith().matching.matcher();

    expect(await matcher?.matches("1234", { salt: SALT, verifier: "short" })).toBe(false);
  });

  it("does not match a verifier made with another pepper", async () => {
    const other = Buffer.alloc(32, 8).toString("base64url");
    const matcher = await matchingWith().matching.matcher();

    expect(
      await matcher?.matches("1234", { salt: SALT, verifier: derivePinVerifier(other, PIN_HASH) }),
    ).toBe(false);
  });

  it("has no matcher when the register has no pepper", async () => {
    expect(await matchingWith({ pepper: undefined }).matching.matcher()).toBeUndefined();
  });

  it("fails when hashing the PIN fails", async () => {
    const matching = createPinMatching({
      readPepper: async () => PEPPER,
      hashPin: async () => {
        throw new Error("the hashing failed");
      },
    });

    await expect((await matching.matcher())?.matches("1234", credential)).rejects.toThrow(
      "the hashing failed",
    );
  });

  it("matches with the real PIN hash scheme", async () => {
    const realHash = await hashPin("123456", SALT);
    const matching = createPinMatching({ readPepper: async () => PEPPER, hashPin });
    const stored = { salt: SALT, verifier: derivePinVerifier(PEPPER, realHash) };
    const matcher = await matching.matcher();

    expect(await matcher?.matches("123456", stored)).toBe(true);
    expect(await matcher?.matches("654321", stored)).toBe(false);
  });
});
