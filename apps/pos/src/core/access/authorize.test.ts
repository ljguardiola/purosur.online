import type { RegisterOperation } from "@purosur/domain";
import type { PinHolder, PinSignInFailures } from "@purosur/domain/access/use-cases";
import { describe, expect, it } from "vitest";
import { derivePinVerifier } from "../credentials/pin-verifier";
import { authorize } from "./authorize";
import type { PinCredential } from "./pin-matching";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "hash-of-the-right-pin";
const NOW = new Date("2026-05-01T10:00:00.000Z");
const CASH_IN: RegisterOperation = { kind: "record_cash_movement", movement: "CASH_IN" };

const PIN_HOLDER: PinHolder<PinCredential> = {
  firstName: "Grace",
  access: { isAdministrator: false, permissionKeys: ["record_cash_in"] },
  credential: { salt: new Uint8Array(16).fill(1), verifier: derivePinVerifier(PEPPER, PIN_HASH) },
};

function failuresAt(consecutiveFailures: number, secondsAgo = 3600): PinSignInFailures {
  return {
    consecutiveFailures,
    lastFailedAt: new Date(NOW.getTime() - secondsAgo * 1000),
  };
}

function deps(
  options: {
    holder?: PinHolder<PinCredential>;
    failures?: PinSignInFailures;
    pepper?: string | undefined;
  } = {},
) {
  const { holder = PIN_HOLDER, failures } = options;
  return {
    store: {
      pinHolder: (userId: string) => (userId === "u2" ? holder : undefined),
      pinSignInFailures: () => failures,
      recordPinSignInFailure: (_userId: string, at: Date) => ({
        consecutiveFailures: (failures?.consecutiveFailures ?? 0) + 1,
        lastFailedAt: at,
      }),
      withdrawPinSignInFailure: () => {},
      clearPinSignInFailures: () => {},
    },
    readPepper: async () => ("pepper" in options ? options.pepper : PEPPER),
    hashPin: async (pin: string) => (pin === "1234" ? PIN_HASH : "hash-of-another-pin"),
    now: () => NOW,
  };
}

describe("authorizing with another person's PIN", () => {
  it("answers who authorized with the right PIN", async () => {
    expect(await authorize(deps(), { user_id: "u2", pin: "1234" }, CASH_IN)).toEqual({
      kind: "authorized",
      by: { user_id: "u2", first_name: "Grace" },
    });
  });

  it("answers a wrong PIN with the wait and the attempts left", async () => {
    expect(await authorize(deps(), { user_id: "u2", pin: "9999" }, CASH_IN)).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
  });

  it("answers the wait a person has to serve", async () => {
    expect(
      await authorize(
        deps({ failures: failuresAt(5, 1) }),
        { user_id: "u2", pin: "1234" },
        CASH_IN,
      ),
    ).toMatchObject({ kind: "rate_limited" });
  });

  it("answers a lockout", async () => {
    expect(
      await authorize(deps({ failures: failuresAt(8) }), { user_id: "u2", pin: "1234" }, CASH_IN),
    ).toEqual({ kind: "locked", consecutive_failures: 8 });
  });

  it("answers that the person lacks the permission", async () => {
    const holder = { ...PIN_HOLDER, access: { isAdministrator: false, permissionKeys: [] } };

    expect(await authorize(deps({ holder }), { user_id: "u2", pin: "1234" }, CASH_IN)).toEqual({
      kind: "lacks_permission",
    });
  });

  it("answers that authorizing is unavailable when the register has no pepper", async () => {
    expect(
      await authorize(deps({ pepper: undefined }), { user_id: "u2", pin: "1234" }, CASH_IN),
    ).toEqual({
      kind: "unavailable",
    });
  });
});
