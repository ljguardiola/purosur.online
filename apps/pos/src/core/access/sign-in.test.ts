import { encodePinHash, PERMISSION_KEYS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { hashPin } from "./pin-hash";
import { derivePinVerifier } from "./pin-verifier";
import { type SignInDeps, signIn } from "./sign-in";
import type { SignInRecord } from "./sqlite-sign-in-store";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const SALT = encodePinHash(new Uint8Array(16).fill(1));
const PIN_HASH = "hash-of-the-right-pin";

function record(overrides: Partial<SignInRecord> = {}): SignInRecord {
  return {
    firstName: "Ada",
    salt: SALT,
    verifier: derivePinVerifier(PEPPER, PIN_HASH),
    access: { isAdministrator: false, permissionKeys: ["sell_and_charge", "adjust_stock"] },
    ...overrides,
  };
}

function deps(overrides: Partial<SignInDeps> & { record?: SignInRecord | undefined } = {}) {
  const hashed: { pin: string; salt: Uint8Array }[] = [];
  const { record: stored, ...rest } =
    "record" in overrides ? overrides : { record: record(), ...overrides };
  const built: SignInDeps = {
    store: { signInRecord: () => stored },
    readPepper: async () => PEPPER,
    hashPin: async (pin, salt) => {
      hashed.push({ pin, salt });
      return pin === "1234" ? PIN_HASH : "hash-of-another-pin";
    },
    ...rest,
  };
  return { built, hashed };
}

describe("signing in", () => {
  it("signs in a person who enters the right PIN and holds a register permission", async () => {
    expect(await signIn(deps().built, "u1", "1234")).toEqual({
      kind: "signed_in",
      person: {
        user_id: "u1",
        first_name: "Ada",
        permission_keys: ["sell_and_charge", "adjust_stock"],
      },
    });
  });

  it("hashes the PIN with the salt the user was given", async () => {
    const { built, hashed } = deps();

    await signIn(built, "u1", "1234");

    expect(hashed).toEqual([{ pin: "1234", salt: new Uint8Array(16).fill(1) }]);
  });

  it("refuses a wrong PIN", async () => {
    expect(await signIn(deps().built, "u1", "9999")).toEqual({ kind: "wrong_pin" });
  });

  it("refuses a user who cannot sign in as it refuses a wrong PIN", async () => {
    const { built, hashed } = deps({ record: undefined });

    expect(await signIn(built, "u1", "1234")).toEqual({ kind: "wrong_pin" });
    expect(hashed).toEqual([]);
  });

  it("refuses a user whose salt is not a valid salt as it refuses a wrong PIN", async () => {
    expect(await signIn(deps({ record: record({ salt: "c2FsdA" }) }).built, "u1", "1234")).toEqual({
      kind: "wrong_pin",
    });
  });

  it("refuses a stored verifier of another length without failing", async () => {
    expect(
      await signIn(deps({ record: record({ verifier: "short" }) }).built, "u1", "1234"),
    ).toEqual({ kind: "wrong_pin" });
  });

  it("refuses a verifier made with another pepper", async () => {
    const otherPepper = Buffer.alloc(32, 9).toString("base64url");
    const stored = record({ verifier: derivePinVerifier(otherPepper, PIN_HASH) });

    expect(await signIn(deps({ record: stored }).built, "u1", "1234")).toEqual({
      kind: "wrong_pin",
    });
  });

  it("is unavailable when the register has no pepper, without hashing", async () => {
    const { built, hashed } = deps({ readPepper: async () => undefined });

    expect(await signIn(built, "u1", "1234")).toEqual({ kind: "unavailable" });
    expect(hashed).toEqual([]);
  });

  it("does not open the register to a right PIN whose person holds no register permission", async () => {
    const stored = record({
      access: { isAdministrator: false, permissionKeys: ["manage_suppliers"] },
    });

    expect(await signIn(deps({ record: stored }).built, "u1", "1234")).toEqual({
      kind: "no_register_permission",
    });
  });

  it("tells a wrong PIN before it tells a missing permission", async () => {
    const stored = record({ access: { isAdministrator: false, permissionKeys: [] } });

    expect(await signIn(deps({ record: stored }).built, "u1", "9999")).toEqual({
      kind: "wrong_pin",
    });
  });

  it("signs in an Administrator with every permission of the catalog", async () => {
    const stored = record({ access: { isAdministrator: true, permissionKeys: [] } });

    const outcome = await signIn(deps({ record: stored }).built, "u1", "1234");

    expect(outcome.kind).toBe("signed_in");
    expect(outcome.kind === "signed_in" && outcome.person.permission_keys).toEqual([
      ...PERMISSION_KEYS,
    ]);
  });

  it("signs in with the real PIN hash scheme", async () => {
    const realHash = await hashPin("123456", new Uint8Array(16).fill(1));
    const stored = record({ verifier: derivePinVerifier(PEPPER, realHash) });

    expect(
      (await signIn({ ...deps({ record: stored }).built, hashPin }, "u1", "123456")).kind,
    ).toBe("signed_in");
    expect(
      (await signIn({ ...deps({ record: stored }).built, hashPin }, "u1", "654321")).kind,
    ).toBe("wrong_pin");
  });
});
