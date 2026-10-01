import type { Authorization, AuthorizedBy } from "@purosur/contracts";
import { encodePinHash, type RoleAccess } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type ActionGate,
  type ActionGateDeps,
  type AuthorizedActor,
  createActionGate,
  type SignedInActor,
} from "./action-gate";
import { derivePinVerifier } from "./pin-verifier";
import { createSignedInPerson } from "./signed-in-person";
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

interface Options {
  failures?: PinSignInFailures | undefined;
  signedInAs?: string | null;
  accessOf?: Record<string, RoleAccess>;
  overrides?: Partial<ActionGateDeps>;
}

const OWN_ACCESS: RoleAccess = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };

function deps({
  failures,
  signedInAs = "u1",
  accessOf = { u1: OWN_ACCESS },
  overrides = {},
}: Options = {}): ActionGateDeps {
  const signedIn = createSignedInPerson();
  if (signedInAs !== null) {
    signedIn.set(signedInAs);
  }
  return {
    signedInPerson: signedIn,
    store: {
      activePerson: (userId) => {
        const access = accessOf[userId];
        return access === undefined ? undefined : { firstName: "Ada", access };
      },
      signInRecord: (userId) =>
        userId === "u2" ? record(["record_cash_in", "close_anothers_register_session"]) : undefined,
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

type RunnableOperation = Parameters<ActionGate["run"]>[0];

function guardedCashIn(sandbox: ActionGateDeps, authorization?: Authorization) {
  const performed: AuthorizedActor[] = [];
  const outcome = createActionGate(sandbox).runAuthorized(
    { kind: "record_cash_movement", movement: "CASH_IN" },
    authorization,
    async (actor) => {
      performed.push(actor);
      return "cash in recorded";
    },
  );
  return { outcome, performed };
}

const CASHIER_WITH_CASH_IN: Record<string, RoleAccess> = {
  u1: { isAdministrator: false, permissionKeys: ["record_cash_in"] },
};

describe("running an operation for the signed-in person", () => {
  function sell(sandbox: ActionGateDeps, operation: RunnableOperation = { kind: "sell" }) {
    const performed: SignedInActor[] = [];
    const outcome = createActionGate(sandbox).run(operation, async (actor) => {
      performed.push(actor);
      return "sold";
    });
    return { outcome, performed };
  }

  it("runs the operation for a signed-in person the domain permits", async () => {
    const { outcome, performed } = sell(deps());

    expect(await outcome).toEqual({ kind: "performed", result: "sold" });
    expect(performed).toEqual([{ signedInUserId: "u1" }]);
  });

  it("runs the operation for a signed-in Administrator", async () => {
    const admin = { u1: { isAdministrator: true, permissionKeys: [] } };

    expect((await sell(deps({ accessOf: admin })).outcome).kind).toBe("performed");
  });

  it("opens a cash session for a person the domain permits", async () => {
    const { outcome } = sell(deps(), { kind: "open_cash_session" });

    expect((await outcome).kind).toBe("performed");
  });

  it("refuses the operation of a signed-in person the domain refuses", async () => {
    const { outcome, performed } = sell(
      deps({ accessOf: { u1: { isAdministrator: false, permissionKeys: [] } } }),
    );

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("refuses the operation when nobody is signed in", async () => {
    const { outcome, performed } = sell(deps({ signedInAs: null }));

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("treats a signed-in person who no longer has any access as nobody signed in", async () => {
    const { outcome, performed } = sell(deps({ accessOf: {} }));

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("takes only operations the signed-in person performs on their own", () => {
    expectTypeOf<{ kind: "sell" }>().toExtend<RunnableOperation>();
    expectTypeOf<{ kind: "open_cash_session" }>().toExtend<RunnableOperation>();
    expectTypeOf<{
      kind: "close_cash_session";
      session: { openedBy: string };
    }>().toExtend<RunnableOperation>();
    expectTypeOf<{
      kind: "record_cash_movement";
      movement: "CASH_IN";
    }>().not.toExtend<RunnableOperation>();
    expectTypeOf<{
      kind: "close_locked_register";
      session: undefined;
    }>().not.toExtend<RunnableOperation>();
  });

  it("cannot refuse with a PIN refusal", async () => {
    type Outcome = Awaited<ReturnType<ActionGate["run"]>>;
    expectTypeOf<Outcome["kind"]>().toEqualTypeOf<
      "performed" | "not_signed_in" | "lacks_permission"
    >();
  });
});

describe("running an operation that may take another person's authorization", () => {
  it("runs the operation on its own for a signed-in person the domain permits", async () => {
    const { outcome, performed } = guardedCashIn(deps({ accessOf: CASHIER_WITH_CASH_IN }));

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: null,
      result: "cash in recorded",
    });
    expect(performed).toEqual([{ signedInUserId: "u1", authorizedBy: null }]);
  });

  it("does not check an authorization the signed-in person did not need", async () => {
    const hashed: string[] = [];
    const { outcome } = guardedCashIn(
      deps({
        accessOf: CASHIER_WITH_CASH_IN,
        overrides: {
          hashPin: async (pin) => {
            hashed.push(pin);
            return PIN_HASH;
          },
        },
      }),
      { user_id: "u2", pin: "1234" },
    );

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: null,
      result: "cash in recorded",
    });
    expect(hashed).toEqual([]);
  });

  it("runs the operation on its own for a signed-in Administrator", async () => {
    const admin = { u1: { isAdministrator: true, permissionKeys: [] } };
    const { outcome } = guardedCashIn(deps({ accessOf: admin }));

    expect((await outcome).kind).toBe("performed");
  });

  it("refuses a signed-in person who needs an authorization and brings none", async () => {
    const { outcome, performed } = guardedCashIn(deps());

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("refuses the operation when nobody is signed in", async () => {
    const { outcome, performed } = guardedCashIn(
      deps({ signedInAs: null, accessOf: CASHIER_WITH_CASH_IN }),
    );

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("refuses an authorized operation when nobody is signed in", async () => {
    const { outcome, performed } = guardedCashIn(deps({ signedInAs: null }), {
      user_id: "u2",
      pin: "1234",
    });

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("treats a signed-in person who no longer has any access as nobody signed in", async () => {
    const { outcome, performed } = guardedCashIn(deps({ accessOf: {} }));

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("treats a signed-in person who no longer has any access as nobody signed in, though an authorization comes along, without checking the PIN", async () => {
    const hashed: string[] = [];
    const { outcome, performed } = guardedCashIn(
      deps({
        accessOf: {},
        overrides: {
          hashPin: async (pin) => {
            hashed.push(pin);
            return PIN_HASH;
          },
        },
      }),
      { user_id: "u2", pin: "1234" },
    );

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
    expect(hashed).toEqual([]);
  });

  it("takes only a cash movement", () => {
    type RunAuthorized = Parameters<ActionGate["runAuthorized"]>[0];
    expectTypeOf<{ kind: "record_cash_movement"; movement: "CASH_IN" }>().toExtend<RunAuthorized>();
    expectTypeOf<{ kind: "sell" }>().not.toExtend<RunAuthorized>();
  });
});

describe("closing the open cash session", () => {
  function closeCashSession(sandbox: ActionGateDeps, openedBy = "u1") {
    const performed: SignedInActor[] = [];
    const outcome = createActionGate(sandbox).run(
      { kind: "close_cash_session", session: { openedBy } },
      async (actor) => {
        performed.push(actor);
        return "cash session closed";
      },
    );
    return { outcome, performed };
  }

  it("runs for the signed-in person who opened it, though they hold no permission", async () => {
    const { outcome, performed } = closeCashSession(
      deps({ accessOf: { u1: { isAdministrator: false, permissionKeys: [] } } }),
    );

    expect(await outcome).toEqual({ kind: "performed", result: "cash session closed" });
    expect(performed).toEqual([{ signedInUserId: "u1" }]);
  });

  it("runs for its opener who no longer has any access", async () => {
    const { outcome, performed } = closeCashSession(deps({ accessOf: {} }));

    expect((await outcome).kind).toBe("performed");
    expect(performed).toEqual([{ signedInUserId: "u1" }]);
  });

  it("refuses a signed-in person who is not its opener", async () => {
    const { outcome, performed } = closeCashSession(deps(), "u2");

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("refuses when nobody is signed in", async () => {
    const { outcome, performed } = closeCashSession(deps({ signedInAs: null }));

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });
});

describe("running an operation with another person's authorization", () => {
  it("runs the action with the person who authorized it, though the signed-in person lacks the permission", async () => {
    const { outcome, performed } = guardedCashIn(deps(), { user_id: "u2", pin: "1234" });

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: { user_id: "u2", first_name: "Grace" },
      result: "cash in recorded",
    });
    expect(performed).toEqual([
      { signedInUserId: "u1", authorizedBy: { user_id: "u2", first_name: "Grace" } },
    ]);
  });

  it("does not run the action when the signed-in person leaves while the authorization is checked", async () => {
    const holder = createSignedInPerson();
    holder.set("u1");
    const { outcome, performed } = guardedCashIn(
      deps({
        overrides: {
          signedInPerson: holder,
          hashPin: async () => {
            holder.clear();
            return PIN_HASH;
          },
        },
      }),
      { user_id: "u2", pin: "1234" },
    );

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("does not run the action when someone else signs in while the authorization is checked", async () => {
    const holder = createSignedInPerson();
    holder.set("u1");
    const { outcome, performed } = guardedCashIn(
      deps({
        accessOf: { u1: OWN_ACCESS, u3: OWN_ACCESS },
        overrides: {
          signedInPerson: holder,
          hashPin: async () => {
            holder.set("u3");
            return PIN_HASH;
          },
        },
      }),
      { user_id: "u2", pin: "1234" },
    );

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("does not run the action on a wrong PIN", async () => {
    const { outcome, performed } = guardedCashIn(deps(), { user_id: "u2", pin: "9999" });

    expect(await outcome).toEqual({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
    expect(performed).toEqual([]);
  });

  it("does not run the action while the person has to wait", async () => {
    const waiting = { consecutiveFailures: 4, lastFailedAt: new Date(NOW.getTime() - 1000) };
    const { outcome, performed } = guardedCashIn(deps({ failures: waiting }), {
      user_id: "u2",
      pin: "1234",
    });

    expect(await outcome).toEqual({
      kind: "rate_limited",
      retry_after_seconds: 1,
      attempts_left: 4,
    });
    expect(performed).toEqual([]);
  });

  it("does not run the action for a locked person", async () => {
    const locked = { consecutiveFailures: 8, lastFailedAt: new Date(NOW.getTime() - 3600_000) };
    const { outcome, performed } = guardedCashIn(deps({ failures: locked }), {
      user_id: "u2",
      pin: "1234",
    });

    expect(await outcome).toEqual({ kind: "locked", consecutive_failures: 8 });
    expect(performed).toEqual([]);
  });

  it("does not run the action when the person lacks the permission", async () => {
    const base = deps();
    const lacking = deps({
      overrides: { store: { ...base.store, signInRecord: () => record(["sell_and_charge"]) } },
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
    const { outcome, performed } = guardedCashIn(
      deps({ overrides: { readPepper: async () => undefined } }),
      { user_id: "u2", pin: "1234" },
    );

    expect(await outcome).toEqual({ kind: "unavailable" });
    expect(performed).toEqual([]);
  });
});

describe("running an operation on a locked register with a person's own PIN", () => {
  function lockedClose(
    sandbox: ActionGateDeps,
    authorization: Authorization,
    openSession: { openedBy: string } | null = { openedBy: "u1" },
  ) {
    const performed: AuthorizedBy[] = [];
    const outcome = createActionGate(sandbox).runWhileLocked(
      { kind: "close_locked_register", session: openSession ?? undefined },
      authorization,
      async (person) => {
        performed.push(person);
        return "done while locked";
      },
    );
    return { outcome, performed };
  }

  const RIGHT_PIN = { user_id: "u2", pin: "1234" };

  it("runs the action as the person whose PIN holds its permission, without signing them in", async () => {
    const sandbox = deps({ signedInAs: null });
    const { outcome, performed } = lockedClose(sandbox, RIGHT_PIN);

    expect(await outcome).toEqual({ kind: "performed", result: "done while locked" });
    expect(performed).toEqual([{ user_id: "u2", first_name: "Grace" }]);
    expect(sandbox.signedInPerson.userId()).toBeUndefined();
  });

  it("refuses the person who opened the open session, though their PIN holds the permission, without checking the PIN", async () => {
    const hashed: string[] = [];
    const { outcome, performed } = lockedClose(
      deps({
        signedInAs: null,
        overrides: {
          hashPin: async (pin) => {
            hashed.push(pin);
            return PIN_HASH;
          },
        },
      }),
      RIGHT_PIN,
      { openedBy: "u2" },
    );

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
    expect(hashed).toEqual([]);
  });

  it("runs the action when no session is open", async () => {
    const { outcome, performed } = lockedClose(deps({ signedInAs: null }), RIGHT_PIN, null);

    expect((await outcome).kind).toBe("performed");
    expect(performed).toEqual([{ user_id: "u2", first_name: "Grace" }]);
  });

  it("refuses while someone is signed in, without checking the PIN", async () => {
    const hashed: string[] = [];
    const { outcome, performed } = lockedClose(
      deps({
        overrides: {
          hashPin: async (pin) => {
            hashed.push(pin);
            return PIN_HASH;
          },
        },
      }),
      RIGHT_PIN,
    );

    expect(await outcome).toEqual({ kind: "not_locked" });
    expect(performed).toEqual([]);
    expect(hashed).toEqual([]);
  });

  it("does not run the action when someone signs in while the PIN is checked", async () => {
    const holder = createSignedInPerson();
    const { outcome, performed } = lockedClose(
      deps({
        signedInAs: null,
        overrides: {
          signedInPerson: holder,
          hashPin: async () => {
            holder.set("u1");
            return PIN_HASH;
          },
        },
      }),
      RIGHT_PIN,
    );

    expect(await outcome).toEqual({ kind: "not_locked" });
    expect(performed).toEqual([]);
  });

  it("takes only closing a locked register", () => {
    type RunWhileLocked = Parameters<ActionGate["runWhileLocked"]>[0];
    expectTypeOf<{
      kind: "close_locked_register";
      session: undefined;
    }>().toExtend<RunWhileLocked>();
    expectTypeOf<{ kind: "sell" }>().not.toExtend<RunWhileLocked>();
  });

  it("refuses a person who lacks the permission", async () => {
    const base = deps({ signedInAs: null });
    const lacking = {
      ...base,
      store: { ...base.store, signInRecord: () => record(["sell_and_charge"]) },
    };
    const { outcome, performed } = lockedClose(lacking, RIGHT_PIN);

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("refuses a wrong PIN and counts the failure", async () => {
    const base = deps({ signedInAs: null });
    const counted: string[] = [];
    const counting: ActionGateDeps = {
      ...base,
      store: {
        ...base.store,
        recordPinSignInFailure: (userId, at) => {
          counted.push(userId);
          return base.store.recordPinSignInFailure(userId, at);
        },
      },
    };
    const { outcome, performed } = lockedClose(counting, { user_id: "u2", pin: "9999" });

    expect(await outcome).toEqual({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
    expect(performed).toEqual([]);
    expect(counted).toEqual(["u2"]);
  });
});
