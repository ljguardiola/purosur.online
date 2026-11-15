import { describe, expect, it } from "vitest";
import { withdrawAlertEmailOptIn } from "./alert-email-opt-in-withdrawal.js";
import { FakeAlertEmailOptInStore } from "./test-support/fake-alert-email-opt-in-store.js";

const BRANCH = "branch-1";
const AT = new Date("2026-10-01T12:00:00.000Z");
const OPTED_IN_AT = new Date("2026-09-01T10:00:00.000Z");
const WITHDRAWAL = { userId: "u-1", locationId: BRANCH, actorId: "actor-1", at: AT };

function storeWith(alertEmailOptedInAt: Date | null = OPTED_IN_AT) {
  const store = new FakeAlertEmailOptInStore();
  store.seedUser({ id: "u-1", locationId: BRANCH, active: true, alertEmailOptedInAt });
  store.seedUser({ id: "u-2", locationId: BRANCH, active: true, alertEmailOptedInAt: OPTED_IN_AT });
  return store;
}

describe("withdrawAlertEmailOptIn", () => {
  it("clears the opt-in, audits the one withdrawn under the actor and opens the alert for the user", async () => {
    const store = storeWith();

    const outcome = await withdrawAlertEmailOptIn(store, WITHDRAWAL);

    expect(outcome).toEqual({ kind: "withdrawn" });
    expect(store.current.users).toEqual([
      { id: "u-1", locationId: BRANCH, active: true, alertEmailOptedInAt: null },
      { id: "u-2", locationId: BRANCH, active: true, alertEmailOptedInAt: OPTED_IN_AT },
    ]);
    expect(store.current.changes).toEqual([
      {
        userId: "u-1",
        actorId: "actor-1",
        change: { kind: "alert_email_opt_in_withdrawn", optedInAt: OPTED_IN_AT },
      },
    ]);
    expect(store.current.alerts).toEqual([
      { userId: "u-1", change: "withdrawn", actorId: "actor-1", openedAt: AT },
    ]);
  });

  it("locks the user before writing anything", async () => {
    const store = storeWith();

    await withdrawAlertEmailOptIn(store, WITHDRAWAL);

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

    const outcome = await withdrawAlertEmailOptIn(store, WITHDRAWAL);

    expect(outcome).toEqual({ kind: "not_recorded" });
    expect(store.current).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchUserOptIn"]);
  });

  it("finds no user of another branch or a deactivated one, and writes nothing", async () => {
    const store = storeWith();
    store.seedUser({ id: "u-3", locationId: "branch-2", active: true, alertEmailOptedInAt: AT });
    store.seedUser({ id: "u-4", locationId: BRANCH, active: false, alertEmailOptedInAt: AT });
    const before = store.snapshot();

    expect(await withdrawAlertEmailOptIn(store, { ...WITHDRAWAL, userId: "u-3" })).toEqual({
      kind: "not_found",
    });
    expect(await withdrawAlertEmailOptIn(store, { ...WITHDRAWAL, userId: "u-4" })).toEqual({
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

      await expect(withdrawAlertEmailOptIn(store, WITHDRAWAL)).rejects.toThrow(`${failing} failed`);

      expect(store.current).toEqual(before);
    },
  );
});
