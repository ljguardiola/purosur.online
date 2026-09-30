import { encodePinHash } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { runGuarded } from "./guarded-action";
import { derivePinVerifier } from "./pin-verifier";
import type { SignInDeps } from "./sign-in";
import type { SignInRecord } from "./sqlite-sign-in-store";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const SALT = encodePinHash(new Uint8Array(16).fill(1));
const PIN_HASH = "hash-of-the-right-pin";

function record(permissionKeys: string[]): SignInRecord {
  return {
    firstName: "Grace",
    salt: SALT,
    verifier: derivePinVerifier(PEPPER, PIN_HASH),
    access: { isAdministrator: false, permissionKeys },
  };
}

function deps(overrides: Partial<SignInDeps> = {}): SignInDeps {
  return {
    store: { signInRecord: (userId) => (userId === "u2" ? record(["record_cash_in"]) : undefined) },
    readPepper: async () => PEPPER,
    hashPin: async (pin) => (pin === "1234" ? PIN_HASH : "hash-of-another-pin"),
    ...overrides,
  };
}

function guardedCashIn(sandbox: SignInDeps, authorization?: { user_id: string; pin: string }) {
  const performed: (string | null)[] = [];
  const outcome = runGuarded(
    sandbox,
    { permission: "record_cash_in", authorization },
    async (authorizedBy) => {
      performed.push(authorizedBy?.first_name ?? null);
      return "cash in recorded";
    },
  );
  return { outcome, performed };
}

describe("running a guarded action", () => {
  it("runs the action on its own when nobody authorizes it", async () => {
    const { outcome, performed } = guardedCashIn(deps());

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: null,
      result: "cash in recorded",
    });
    expect(performed).toEqual([null]);
  });

  it("runs the action with the person who authorized it", async () => {
    const { outcome, performed } = guardedCashIn(deps(), { user_id: "u2", pin: "1234" });

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: { user_id: "u2", first_name: "Grace" },
      result: "cash in recorded",
    });
    expect(performed).toEqual(["Grace"]);
  });

  it("does not run the action on a wrong PIN", async () => {
    const { outcome, performed } = guardedCashIn(deps(), { user_id: "u2", pin: "9999" });

    expect(await outcome).toEqual({ kind: "wrong_pin" });
    expect(performed).toEqual([]);
  });

  it("does not run the action when the person lacks the permission", async () => {
    const lacking = deps({ store: { signInRecord: () => record(["sell_and_charge"]) } });
    const { outcome, performed } = guardedCashIn(lacking, { user_id: "u2", pin: "1234" });

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("does not run the action for an unknown person", async () => {
    const { outcome, performed } = guardedCashIn(deps(), { user_id: "nobody", pin: "1234" });

    expect(await outcome).toEqual({ kind: "wrong_pin" });
    expect(performed).toEqual([]);
  });

  it("does not run the action when the register has no pepper", async () => {
    const { outcome, performed } = guardedCashIn(deps({ readPepper: async () => undefined }), {
      user_id: "u2",
      pin: "1234",
    });

    expect(await outcome).toEqual({ kind: "unavailable" });
    expect(performed).toEqual([]);
  });
});
