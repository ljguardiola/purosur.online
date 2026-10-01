import type { OpenCashSession } from "@purosur/contracts";
import type { PinHolder, PinSignInFailures } from "@purosur/domain/access/use-cases";
import { describe, expect, it } from "vitest";
import type { PinCredential } from "./pin-matching";
import { derivePinVerifier } from "./pin-verifier";
import { firstSignIn, type SignInDeps, signIn } from "./sign-in";
import { createSignedInPerson } from "./signed-in-person";

const PEPPER = Buffer.alloc(32, 7).toString("base64url");
const PIN_HASH = "hash-of-the-right-pin";
const NOW = new Date("2026-05-01T10:00:00.000Z");

const OPEN_CASH_SESSION: OpenCashSession = {
  id: "s1",
  opened_at: "2026-05-01T09:00:00.000Z",
  opened_by: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
  locked: false,
};

const PIN_HOLDER: PinHolder<PinCredential> = {
  firstName: "Ada",
  access: { isAdministrator: false, permissionKeys: ["sell_and_charge", "adjust_stock"] },
  credential: { salt: new Uint8Array(16).fill(1), verifier: derivePinVerifier(PEPPER, PIN_HASH) },
};

function failuresAt(consecutiveFailures: number, secondsAgo = 3600): PinSignInFailures {
  return {
    consecutiveFailures,
    lastFailedAt: new Date(NOW.getTime() - secondsAgo * 1000),
  };
}

interface Options extends Partial<Omit<SignInDeps, "store">> {
  holder?: PinHolder<PinCredential>;
  failures?: PinSignInFailures;
}

function deps({ holder = PIN_HOLDER, failures, ...overrides }: Options = {}) {
  const remembered: string[] = [];
  const signedIn = createSignedInPerson();
  const built: SignInDeps = {
    signedInPerson: signedIn,
    store: {
      remember: (userId) => {
        remembered.push(userId);
      },
      pinHolder: () => holder,
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
    openCashSession: () => undefined,
    cashSession: () => null,
    ...overrides,
  };
  return { built, signedIn, remembered };
}

describe("signing in", () => {
  it("answers who signed in, with their abilities and the cash session they see", async () => {
    const readFor: string[] = [];
    const { built, signedIn } = deps({
      cashSession: (personId) => {
        readFor.push(personId);
        return OPEN_CASH_SESSION;
      },
    });

    expect(await signIn(built, "u1", "1234")).toEqual({
      kind: "signed_in",
      person: { user_id: "u1", first_name: "Ada", abilities: ["open_cash_session"] },
      cash_session: OPEN_CASH_SESSION,
    });
    expect(readFor).toEqual(["u1"]);
    expect(signedIn.userId()).toBe("u1");
  });

  it("answers a wrong PIN with the wait and the attempts left, signing nobody in", async () => {
    const { built, signedIn } = deps();
    signedIn.set("u9");

    expect(await signIn(built, "u1", "9999")).toEqual({
      kind: "wrong_pin",
      retry_after_seconds: 0,
      attempts_left: 7,
    });
    expect(signedIn.userId()).toBeUndefined();
  });

  it("answers the wait a person has to serve", async () => {
    expect(await signIn(deps({ failures: failuresAt(5, 1) }).built, "u1", "1234")).toMatchObject({
      kind: "rate_limited",
    });
  });

  it("answers a lockout", async () => {
    expect(await signIn(deps({ failures: failuresAt(8) }).built, "u1", "1234")).toEqual({
      kind: "locked",
      consecutive_failures: 8,
    });
  });

  it("answers that signing in is unavailable when the register has no pepper", async () => {
    expect(await signIn(deps({ readPepper: async () => undefined }).built, "u1", "1234")).toEqual({
      kind: "unavailable",
    });
  });

  it("answers that the person holds no register permission", async () => {
    const holder = { ...PIN_HOLDER, access: { isAdministrator: false, permissionKeys: [] } };

    expect(await signIn(deps({ holder }).built, "u1", "1234")).toEqual({
      kind: "no_register_permission",
    });
  });

  it("answers that the cash session was opened by another person", async () => {
    const { built } = deps({ openCashSession: () => ({ openedBy: "u2" }) });

    expect(await signIn(built, "u1", "1234")).toEqual({ kind: "cash_session_opened_by_another" });
  });

  it("remembers nobody", async () => {
    const { built, remembered } = deps();

    await signIn(built, "u1", "1234");

    expect(remembered).toEqual([]);
  });

  it("fails, signing nobody in and remembering nobody, when the open cash session cannot be read", async () => {
    const { built, signedIn, remembered } = deps({
      openCashSession: () => ({ openedBy: "u1" }),
      cashSession: () => {
        throw new Error("the register database is unavailable");
      },
    });

    await expect(signIn(built, "u1", "1234")).rejects.toThrow();
    expect(signedIn.userId()).toBeUndefined();
    expect(remembered).toEqual([]);
  });
});

describe("signing in for the first time on a register", () => {
  it("answers who signed in and remembers them", async () => {
    const { built, remembered } = deps();

    expect((await firstSignIn(built, "u1", "1234")).kind).toBe("signed_in");
    expect(remembered).toEqual(["u1"]);
  });

  it("remembers nobody who is refused", async () => {
    const { built, remembered } = deps();

    expect((await firstSignIn(built, "u1", "9999")).kind).toBe("wrong_pin");
    expect(remembered).toEqual([]);
  });

  it("fails, signing nobody in and remembering nobody, when the open cash session cannot be read", async () => {
    const { built, signedIn, remembered } = deps({
      openCashSession: () => ({ openedBy: "u1" }),
      cashSession: () => {
        throw new Error("the register database is unavailable");
      },
    });

    await expect(firstSignIn(built, "u1", "1234")).rejects.toThrow();
    expect(signedIn.userId()).toBeUndefined();
    expect(remembered).toEqual([]);
  });

  it("fails, signing nobody in, when the person cannot be remembered", async () => {
    const { built, signedIn } = deps();
    const failing: SignInDeps = {
      ...built,
      store: {
        ...built.store,
        remember: () => {
          throw new Error("the register database is unavailable");
        },
      },
    };

    await expect(firstSignIn(failing, "u1", "1234")).rejects.toThrow();
    expect(signedIn.userId()).toBeUndefined();
  });
});
