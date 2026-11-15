import { describe, expect, it } from "vitest";
import { FakeAlertEmailOptInStore } from "./test-support/fake-alert-email-opt-in-store.js";
import { withdrawUserAlertEmailOptIn } from "./withdraw-user-alert-email-opt-in.js";

const BRANCH = "branch-1";
const AT = new Date("2026-10-01T12:00:00.000Z");
const AUTHORIZED_AT = new Date("2026-10-01T11:58:00.000Z");
const OPTED_IN_AT = new Date("2026-09-01T10:00:00.000Z");
const INPUT = {
  locationId: BRANCH,
  administratorId: "admin-1",
  targetUserId: "u-1",
  passkeyAuthorizedAt: AUTHORIZED_AT,
  at: AT,
};

function storeWith(targetOptedInAt: Date | null = OPTED_IN_AT) {
  const store = new FakeAlertEmailOptInStore();
  store.seedUser({
    id: "u-1",
    locationId: BRANCH,
    active: true,
    alertEmailOptedInAt: targetOptedInAt,
  });
  store.seedUser({
    id: "admin-1",
    locationId: BRANCH,
    active: true,
    alertEmailOptedInAt: OPTED_IN_AT,
  });
  return store;
}

describe("withdrawUserAlertEmailOptIn", () => {
  it("clears another user's opt-in, audits it under the administrator and opens the alert for that user", async () => {
    const store = storeWith();

    const outcome = await withdrawUserAlertEmailOptIn({ store }, INPUT);

    expect(outcome).toEqual({ kind: "withdrawn" });
    expect(store.current.users).toEqual([
      { id: "u-1", locationId: BRANCH, active: true, alertEmailOptedInAt: null },
      { id: "admin-1", locationId: BRANCH, active: true, alertEmailOptedInAt: OPTED_IN_AT },
    ]);
    expect(store.current.changes).toEqual([
      {
        userId: "u-1",
        actorId: "admin-1",
        change: { kind: "alert_email_opt_in_withdrawn", optedInAt: OPTED_IN_AT },
      },
    ]);
    expect(store.current.alerts).toEqual([
      { userId: "u-1", change: "withdrawn", actorId: "admin-1", openedAt: AT },
    ]);
  });

  it.each([
    ["never authorized", null],
    ["authorized more than five minutes ago", new Date("2026-10-01T11:54:59.999Z")],
  ])(
    "requires an authorization and reaches no port when the session was %s",
    async (_name, passkeyAuthorizedAt) => {
      const store = storeWith();
      const before = store.snapshot();

      const outcome = await withdrawUserAlertEmailOptIn(
        { store },
        { ...INPUT, targetUserId: "nobody", passkeyAuthorizedAt },
      );

      expect(outcome).toEqual({ kind: "authorization_required" });
      expect(store.current).toEqual(before);
      expect(store.operationOrder).toEqual([]);
    },
  );

  it("refuses the administrator's own account without reaching any port", async () => {
    const store = storeWith();
    const before = store.snapshot();

    const outcome = await withdrawUserAlertEmailOptIn(
      { store },
      { ...INPUT, targetUserId: "admin-1" },
    );

    expect(outcome).toEqual({ kind: "own_account" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual([]);
  });

  it("requires an authorization before refusing the administrator's own account", async () => {
    const store = storeWith();

    const outcome = await withdrawUserAlertEmailOptIn(
      { store },
      { ...INPUT, targetUserId: "admin-1", passkeyAuthorizedAt: null },
    );

    expect(outcome).toEqual({ kind: "authorization_required" });
  });

  it("finds no deactivated user, and writes nothing", async () => {
    const store = storeWith();
    store.seedUser({ id: "u-4", locationId: BRANCH, active: false, alertEmailOptedInAt: AT });
    const before = store.snapshot();

    const outcome = await withdrawUserAlertEmailOptIn({ store }, { ...INPUT, targetUserId: "u-4" });

    expect(outcome).toEqual({ kind: "user_not_found" });
    expect(store.current).toEqual(before);
  });
});
