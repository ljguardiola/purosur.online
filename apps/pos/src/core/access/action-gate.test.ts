import type { Authorization, AuthorizedBy } from "@purosur/contracts";
import { encodePinHash, type RoleAccess } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type ActionGateDeps,
  createActionGate,
  type GuardedAction,
  type GuardedActor,
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

function guardedCashIn(sandbox: ActionGateDeps, authorization?: Authorization) {
  const performed: GuardedActor[] = [];
  const outcome = createActionGate(sandbox).run(
    { permission: "record_cash_in", authorization },
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

describe("running a guarded action for the signed-in person", () => {
  it("runs the action on its own for a signed-in person who holds its permission", async () => {
    const { outcome, performed } = guardedCashIn(deps({ accessOf: CASHIER_WITH_CASH_IN }));

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: null,
      result: "cash in recorded",
    });
    expect(performed).toEqual([{ signedInUserId: "u1", authorizedBy: null }]);
  });

  it("runs the action on its own for a signed-in Administrator", async () => {
    const admin = { u1: { isAdministrator: true, permissionKeys: [] } };
    const { outcome } = guardedCashIn(deps({ accessOf: admin }));

    expect((await outcome).kind).toBe("performed");
  });

  it("refuses the action of a signed-in person who lacks its permission", async () => {
    const { outcome, performed } = guardedCashIn(deps());

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("refuses the action when nobody is signed in", async () => {
    const { outcome, performed } = guardedCashIn(
      deps({ signedInAs: null, accessOf: CASHIER_WITH_CASH_IN }),
    );

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("refuses an authorized action when nobody is signed in", async () => {
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

  it("treats a signed-in person who no longer has any access as nobody signed in, though the action carries an authorization, without checking the PIN", async () => {
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

  it("runs an action with a permission nobody can authorize for a signed-in person who holds it", async () => {
    const outcome = await createActionGate(deps()).run(
      { permission: "sell_and_charge" },
      async (actor) => actor,
    );

    expect(outcome).toEqual({
      kind: "performed",
      authorized_by: null,
      result: { signedInUserId: "u1", authorizedBy: null },
    });
  });

  it("refuses an action with a permission nobody can authorize for a person who lacks it", async () => {
    const outcome = await createActionGate(
      deps({ accessOf: { u1: { isAdministrator: false, permissionKeys: [] } } }),
    ).run({ permission: "sell_and_charge" }, async () => "sold");

    expect(outcome).toEqual({ kind: "lacks_permission" });
  });

  it("takes an authorization only for a permission someone else can authorize", () => {
    expectTypeOf<{
      permission: "record_cash_in";
      authorization: Authorization;
    }>().toExtend<GuardedAction>();
    expectTypeOf<{
      permission: "sell_and_charge";
      authorization: Authorization;
    }>().not.toExtend<GuardedAction>();
  });
});

describe("closing the signed-in person's own cash session", () => {
  function closeOwnCashSession(
    sandbox: ActionGateDeps,
    action: GuardedAction = { closesOwnCashSession: true },
  ) {
    const performed: GuardedActor[] = [];
    const outcome = createActionGate(sandbox).run(action, async (actor) => {
      performed.push(actor);
      return "cash session closed";
    });
    return { outcome, performed };
  }

  it("runs for a signed-in person who holds no permission", async () => {
    const { outcome, performed } = closeOwnCashSession(
      deps({ accessOf: { u1: { isAdministrator: false, permissionKeys: [] } } }),
    );

    expect(await outcome).toEqual({
      kind: "performed",
      authorized_by: null,
      result: "cash session closed",
    });
    expect(performed).toEqual([{ signedInUserId: "u1", authorizedBy: null }]);
  });

  it("runs for a signed-in person who no longer has any access", async () => {
    const { outcome, performed } = closeOwnCashSession(deps({ accessOf: {} }));

    expect((await outcome).kind).toBe("performed");
    expect(performed).toEqual([{ signedInUserId: "u1", authorizedBy: null }]);
  });

  it("refuses when nobody is signed in", async () => {
    const { outcome, performed } = closeOwnCashSession(deps({ signedInAs: null }));

    expect(await outcome).toEqual({ kind: "not_signed_in" });
    expect(performed).toEqual([]);
  });

  it("refuses an authorization, without checking the PIN", async () => {
    const hashed: string[] = [];
    const { outcome, performed } = closeOwnCashSession(
      deps({
        overrides: {
          hashPin: async (pin) => {
            hashed.push(pin);
            return PIN_HASH;
          },
        },
      }),
      JSON.parse('{"closesOwnCashSession":true,"authorization":{"user_id":"u2","pin":"1234"}}'),
    );

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
    expect(hashed).toEqual([]);
  });

  it.each([
    ["an action that names neither a permission nor its own cash session", "{}"],
    ["an action that does not close its own cash session", '{"closesOwnCashSession":false}'],
  ])("refuses %s", async (_case, json) => {
    const parsed: GuardedAction = JSON.parse(json);

    const { outcome, performed } = closeOwnCashSession(deps(), parsed);

    expect(await outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
  });

  it("takes no authorization", () => {
    expectTypeOf<{ closesOwnCashSession: true }>().toExtend<GuardedAction>();
    expectTypeOf<{
      closesOwnCashSession: true;
      authorization: Authorization;
    }>().not.toExtend<GuardedAction>();
  });
});

describe("running a guarded action with another person's authorization", () => {
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

  it("refuses an authorization for a permission nobody can authorize, without checking the PIN", async () => {
    const base = deps({ accessOf: { u1: { isAdministrator: false, permissionKeys: [] } } });
    const hashed: string[] = [];
    const counted: string[] = [];
    const sandbox: ActionGateDeps = {
      ...base,
      store: {
        ...base.store,
        signInRecord: () => record(["sell_and_charge"]),
        recordPinSignInFailure: (userId, at) => {
          counted.push(userId);
          return base.store.recordPinSignInFailure(userId, at);
        },
      },
      hashPin: async (pin, salt) => {
        hashed.push(pin);
        return base.hashPin(pin, salt);
      },
    };
    const parsed: GuardedAction = JSON.parse(
      '{"permission":"sell_and_charge","authorization":{"user_id":"u2","pin":"1234"}}',
    );
    const performed: GuardedActor[] = [];

    const outcome = await createActionGate(sandbox).run(parsed, async (actor) => {
      performed.push(actor);
      return "sold";
    });

    expect(outcome).toEqual({ kind: "lacks_permission" });
    expect(performed).toEqual([]);
    expect(hashed).toEqual([]);
    expect(counted).toEqual([]);
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

describe("running an action on a locked register with a person's own PIN", () => {
  function lockedCashIn(sandbox: ActionGateDeps, authorization: Authorization) {
    const performed: AuthorizedBy[] = [];
    const outcome = createActionGate(sandbox).runWhileLocked(
      "record_cash_in",
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
    const { outcome, performed } = lockedCashIn(sandbox, RIGHT_PIN);

    expect(await outcome).toEqual({ kind: "performed", result: "done while locked" });
    expect(performed).toEqual([{ user_id: "u2", first_name: "Grace" }]);
    expect(sandbox.signedInPerson.userId()).toBeUndefined();
  });

  it("refuses while someone is signed in, without checking the PIN", async () => {
    const hashed: string[] = [];
    const { outcome, performed } = lockedCashIn(
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
    const { outcome, performed } = lockedCashIn(
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

  it("refuses a person who lacks the permission", async () => {
    const base = deps({ signedInAs: null });
    const lacking = {
      ...base,
      store: { ...base.store, signInRecord: () => record(["sell_and_charge"]) },
    };
    const { outcome, performed } = lockedCashIn(lacking, RIGHT_PIN);

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
    const { outcome, performed } = lockedCashIn(counting, { user_id: "u2", pin: "9999" });

    expect(await outcome).toEqual({ kind: "wrong_pin", retry_after_seconds: 0, attempts_left: 7 });
    expect(performed).toEqual([]);
    expect(counted).toEqual(["u2"]);
  });
});
