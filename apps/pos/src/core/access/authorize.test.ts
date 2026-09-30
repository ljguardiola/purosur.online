import { encodePinHash } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { authorize } from "./authorize";
import type { PinCheckDeps } from "./pin-check";
import { derivePinVerifier } from "./pin-verifier";
import type { SignInRecord } from "./sqlite-sign-in-store";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const SALT = encodePinHash(new Uint8Array(16).fill(1));
const PIN_HASH = "hash-of-the-right-pin";

function record(overrides: Partial<SignInRecord> = {}): SignInRecord {
  return {
    firstName: "Grace",
    salt: SALT,
    verifier: derivePinVerifier(PEPPER, PIN_HASH),
    access: { isAdministrator: false, permissionKeys: ["record_cash_in"] },
    ...overrides,
  };
}

function deps(stored: SignInRecord | undefined = record(), overrides: Partial<PinCheckDeps> = {}) {
  const hashed: string[] = [];
  const built: PinCheckDeps = {
    store: { signInRecord: (userId) => (userId === "u2" ? stored : undefined) },
    readPepper: async () => PEPPER,
    hashPin: async (pin) => {
      hashed.push(pin);
      return pin === "1234" ? PIN_HASH : "hash-of-another-pin";
    },
    ...overrides,
  };
  return { built, hashed };
}

describe("authorizing with another person's PIN", () => {
  it("authorizes a person who enters their right PIN and holds the permission", async () => {
    expect(await authorize(deps().built, { user_id: "u2", pin: "1234" }, "record_cash_in")).toEqual(
      { kind: "authorized", by: { user_id: "u2", first_name: "Grace" } },
    );
  });

  it("authorizes an Administrator for any permission", async () => {
    const admin = record({ access: { isAdministrator: true, permissionKeys: [] } });

    expect(
      (await authorize(deps(admin).built, { user_id: "u2", pin: "1234" }, "void_sale")).kind,
    ).toBe("authorized");
  });

  it("refuses a wrong PIN", async () => {
    expect(await authorize(deps().built, { user_id: "u2", pin: "9999" }, "record_cash_in")).toEqual(
      { kind: "wrong_pin" },
    );
  });

  it("refuses an unknown person as it refuses a wrong PIN, without hashing", async () => {
    const { built, hashed } = deps();

    expect(await authorize(built, { user_id: "nobody", pin: "1234" }, "record_cash_in")).toEqual({
      kind: "wrong_pin",
    });
    expect(hashed).toEqual([]);
  });

  it("refuses a right PIN whose person lacks the permission", async () => {
    expect(await authorize(deps().built, { user_id: "u2", pin: "1234" }, "void_sale")).toEqual({
      kind: "lacks_permission",
    });
  });

  it("tells a wrong PIN before it tells a missing permission", async () => {
    expect(await authorize(deps().built, { user_id: "u2", pin: "9999" }, "void_sale")).toEqual({
      kind: "wrong_pin",
    });
  });

  it("is unavailable when the register has no pepper", async () => {
    const { built } = deps(record(), { readPepper: async () => undefined });

    expect(await authorize(built, { user_id: "u2", pin: "1234" }, "record_cash_in")).toEqual({
      kind: "unavailable",
    });
  });

  it("cannot be asked for a permission the person must hold personally", () => {
    expectTypeOf<"sell_and_charge">().not.toExtend<Parameters<typeof authorize>[2]>();
    expectTypeOf<"record_cash_in">().toExtend<Parameters<typeof authorize>[2]>();
  });
});
