import { encodePinHash } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { runGuarded } from "./guarded-action";
import type { PinCheckDeps } from "./pin-check";
import { derivePinVerifier } from "./pin-verifier";
import type { PinSignInFailures, SignInRecord } from "./sqlite-sign-in-store";

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

const NOW = new Date("2026-05-01T10:00:00.000Z");

function deps(
  overrides: Partial<PinCheckDeps> = {},
  failures: PinSignInFailures | undefined = undefined,
): PinCheckDeps {
  return {
    store: {
      signInRecord: (userId) => (userId === "u2" ? record(["record_cash_in"]) : undefined),
      pinSignInFailures: () => failures,
      recordPinSignInFailure: (_userId, at) => ({
        consecutiveFailures: (failures?.consecutiveFailures ?? 0) + 1,
        lastFailedAt: at,
      }),
      withdrawPinSignInFailure: () => {},
      clearPinSignInFailures: () => {},
    },
    readPepper: async () => PEPPER,
    hashPin: async (pin) => (pin === "1234" ? PIN_HASH : "hash-of-another-pin"),
    now: () => NOW,
    ...overrides,
  };
}

function guardedCashIn(sandbox: PinCheckDeps, authorization?: { user_id: string; pin: string }) {
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

    expect(await outcome).toEqual({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
    expect(performed).toEqual([]);
  });

  it("does not run the action while the person has to wait", async () => {
    const waiting = { consecutiveFailures: 4, lastFailedAt: new Date(NOW.getTime() - 1000) };
    const { outcome, performed } = guardedCashIn(deps({}, waiting), { user_id: "u2", pin: "1234" });

    expect(await outcome).toEqual({
      kind: "rate_limited",
      retry_after_seconds: 1,
      attempts_left: 4,
    });
    expect(performed).toEqual([]);
  });

  it("does not run the action for a locked person", async () => {
    const locked = { consecutiveFailures: 8, lastFailedAt: new Date(NOW.getTime() - 3600_000) };
    const { outcome, performed } = guardedCashIn(deps({}, locked), { user_id: "u2", pin: "1234" });

    expect(await outcome).toEqual({ kind: "locked", consecutive_failures: 8 });
    expect(performed).toEqual([]);
  });

  it("does not run the action when the person lacks the permission", async () => {
    const base = deps();
    const lacking = deps({
      store: { ...base.store, signInRecord: () => record(["sell_and_charge"]) },
    });
    const { outcome, performed } = guardedCashIn(lacking, { user_id: "u2", pin: "1234" });

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("does not run the action for an unknown person", async () => {
    const { outcome, performed } = guardedCashIn(deps(), { user_id: "nobody", pin: "1234" });

    expect(await outcome).toEqual({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
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
