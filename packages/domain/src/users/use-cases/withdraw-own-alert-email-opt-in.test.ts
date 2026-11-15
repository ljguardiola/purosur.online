import { describe, expect, it } from "vitest";
import { FakeAlertEmailOptInStore } from "./test-support/fake-alert-email-opt-in-store.js";
import { withdrawOwnAlertEmailOptIn } from "./withdraw-own-alert-email-opt-in.js";

const BRANCH = "branch-1";
const AT = new Date("2026-10-01T12:00:00.000Z");
const AUTHORIZED_AT = new Date("2026-10-01T11:58:00.000Z");
const OPTED_IN_AT = new Date("2026-09-01T10:00:00.000Z");
const INPUT = { userId: "u-1", locationId: BRANCH, passkeyAuthorizedAt: AUTHORIZED_AT, at: AT };

function storeWith(alertEmailOptedInAt: Date | null = OPTED_IN_AT) {
  const store = new FakeAlertEmailOptInStore();
  store.seedUser({ id: "u-1", locationId: BRANCH, active: true, alertEmailOptedInAt });
  store.seedUser({ id: "u-2", locationId: BRANCH, active: true, alertEmailOptedInAt: OPTED_IN_AT });
  return store;
}

describe("withdrawOwnAlertEmailOptIn", () => {
  it("clears the opt-in, audits the one withdrawn and opens the changed recipient set alert", async () => {
    const store = storeWith();

    const outcome = await withdrawOwnAlertEmailOptIn({ store }, INPUT);

    expect(outcome).toEqual({ kind: "withdrawn" });
    expect(store.current.users).toEqual([
      { id: "u-1", locationId: BRANCH, active: true, alertEmailOptedInAt: null },
      { id: "u-2", locationId: BRANCH, active: true, alertEmailOptedInAt: OPTED_IN_AT },
    ]);
    expect(store.current.changes).toEqual([
      {
        userId: "u-1",
        actorId: "u-1",
        change: { kind: "alert_email_opt_in_withdrawn", optedInAt: OPTED_IN_AT },
      },
    ]);
    expect(store.current.alerts).toEqual([
      { userId: "u-1", change: "withdrawn", actorId: "u-1", openedAt: AT },
    ]);
  });

  it("locks the user before writing anything and touches nothing else", async () => {
    const store = storeWith();

    await withdrawOwnAlertEmailOptIn({ store }, INPUT);

    expect(store.operationOrder).toEqual([
      "lockBranchUserOptIn",
      "clearOptIn",
      "recordUserChange",
      "openRecipientsChangedAlert",
    ]);
  });

  it("changes nothing when no opt-in is recorded", async () => {
    const store = storeWith(null);
    const before = store.snapshot();

    const outcome = await withdrawOwnAlertEmailOptIn({ store }, INPUT);

    expect(outcome).toEqual({ kind: "not_recorded" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchUserOptIn"]);
  });

  it.each([
    ["never authorized", null],
    ["authorized more than five minutes ago", new Date("2026-10-01T11:54:59.999Z")],
  ])(
    "requires an authorization and reaches no port when the session was %s",
    async (_name, passkeyAuthorizedAt) => {
      const store = storeWith();
      const before = store.snapshot();

      const outcome = await withdrawOwnAlertEmailOptIn(
        { store },
        { ...INPUT, passkeyAuthorizedAt },
      );

      expect(outcome).toEqual({ kind: "authorization_required" });
      expect(store.current).toEqual(before);
      expect(store.operationOrder).toEqual([]);
    },
  );

  it("finds no user of another branch or a deactivated one, and writes nothing", async () => {
    const store = storeWith();
    store.seedUser({ id: "u-3", locationId: "branch-2", active: true, alertEmailOptedInAt: AT });
    store.seedUser({ id: "u-4", locationId: BRANCH, active: false, alertEmailOptedInAt: AT });
    const before = store.snapshot();

    expect(await withdrawOwnAlertEmailOptIn({ store }, { ...INPUT, userId: "u-3" })).toEqual({
      kind: "not_found",
    });
    expect(await withdrawOwnAlertEmailOptIn({ store }, { ...INPUT, userId: "u-4" })).toEqual({
      kind: "not_found",
    });
    expect(store.current).toEqual(before);
  });

  it.each(["clearOptIn", "recordUserChange", "openRecipientsChangedAlert"] as const)(
    "leaves the opt-in in place when %s fails",
    async (failing) => {
      const store = storeWith();
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(withdrawOwnAlertEmailOptIn({ store }, INPUT)).rejects.toThrow(
        `${failing} failed`,
      );

      expect(store.current).toEqual(before);
    },
  );
});
