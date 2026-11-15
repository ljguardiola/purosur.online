import { describe, expect, it } from "vitest";
import { recordOwnAlertEmailOptIn } from "./record-own-alert-email-opt-in.js";
import { FakeAlertEmailOptInStore } from "./test-support/fake-alert-email-opt-in-store.js";

const BRANCH = "branch-1";
const AT = new Date("2026-10-01T12:00:00.000Z");
const AUTHORIZED_AT = new Date("2026-10-01T11:58:00.000Z");
const EARLIER = new Date("2026-09-01T10:00:00.000Z");
const INPUT = { userId: "u-1", locationId: BRANCH, passkeyAuthorizedAt: AUTHORIZED_AT, at: AT };

function storeWith(alertEmailOptedInAt: Date | null = null) {
  const store = new FakeAlertEmailOptInStore();
  store.seedUser({ id: "u-1", locationId: BRANCH, active: true, alertEmailOptedInAt });
  store.seedUser({ id: "u-2", locationId: BRANCH, active: true, alertEmailOptedInAt: null });
  return store;
}

describe("recordOwnAlertEmailOptIn", () => {
  it("stores the moment of the opt-in, audits it and opens the changed recipient set alert", async () => {
    const store = storeWith();

    const outcome = await recordOwnAlertEmailOptIn({ store }, INPUT);

    expect(outcome).toEqual({ kind: "recorded", optedInAt: AT });
    expect(store.current.users).toEqual([
      { id: "u-1", locationId: BRANCH, active: true, alertEmailOptedInAt: AT },
      { id: "u-2", locationId: BRANCH, active: true, alertEmailOptedInAt: null },
    ]);
    expect(store.current.changes).toEqual([
      {
        userId: "u-1",
        actorId: "u-1",
        change: { kind: "alert_email_opted_in", optedInAt: AT },
      },
    ]);
    expect(store.current.alerts).toEqual([
      { userId: "u-1", change: "opted_in", actorId: "u-1", openedAt: AT },
    ]);
  });

  it("locks the user before writing anything", async () => {
    const store = storeWith();

    await recordOwnAlertEmailOptIn({ store }, INPUT);

    expect(store.operationOrder).toEqual([
      "lockBranchUserOptIn",
      "recordOptIn",
      "recordUserChange",
      "openRecipientsChangedAlert",
    ]);
  });

  it("keeps the original moment and changes nothing when the opt-in is already recorded", async () => {
    const store = storeWith(EARLIER);
    const before = store.snapshot();

    const outcome = await recordOwnAlertEmailOptIn({ store }, INPUT);

    expect(outcome).toEqual({ kind: "already_recorded", optedInAt: EARLIER });
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

      const outcome = await recordOwnAlertEmailOptIn({ store }, { ...INPUT, passkeyAuthorizedAt });

      expect(outcome).toEqual({ kind: "authorization_required" });
      expect(store.current).toEqual(before);
      expect(store.operationOrder).toEqual([]);
    },
  );

  it("requires an authorization before looking for a user that does not exist", async () => {
    const store = storeWith();

    const outcome = await recordOwnAlertEmailOptIn(
      { store },
      { ...INPUT, userId: "nobody", passkeyAuthorizedAt: null },
    );

    expect(outcome).toEqual({ kind: "authorization_required" });
    expect(store.operationOrder).toEqual([]);
  });

  it("finds no user of another branch or a deactivated one, and writes nothing", async () => {
    const store = storeWith();
    store.seedUser({ id: "u-3", locationId: "branch-2", active: true, alertEmailOptedInAt: null });
    store.seedUser({ id: "u-4", locationId: BRANCH, active: false, alertEmailOptedInAt: null });
    const before = store.snapshot();

    expect(await recordOwnAlertEmailOptIn({ store }, { ...INPUT, userId: "u-3" })).toEqual({
      kind: "not_found",
    });
    expect(await recordOwnAlertEmailOptIn({ store }, { ...INPUT, userId: "u-4" })).toEqual({
      kind: "not_found",
    });
    expect(store.current).toEqual(before);
  });

  it.each(["recordOptIn", "recordUserChange", "openRecipientsChangedAlert"] as const)(
    "leaves the user untouched when %s fails",
    async (failing) => {
      const store = storeWith();
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(recordOwnAlertEmailOptIn({ store }, INPUT)).rejects.toThrow(`${failing} failed`);

      expect(store.current).toEqual(before);
    },
  );
});
