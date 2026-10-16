import { describe, expect, it } from "vitest";
import { endEveryBackofficeSession } from "./end-every-backoffice-session.js";
import { FakeBackofficeSessionEndingStore } from "./test-support/fake-backoffice-session-ending-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-10-01T09:00:00.000Z");

function storeWithSessions() {
  const store = new FakeBackofficeSessionEndingStore();
  store.seedSession({ id: "s-admin", userId: "admin-1", revokedAt: null });
  store.seedSession({ id: "s-1", userId: "u-1", revokedAt: null });
  store.seedSession({ id: "s-2", userId: "u-2", revokedAt: null });
  store.seedSession({ id: "s-old", userId: "u-1", revokedAt: EARLIER });
  return store;
}

describe("endEveryBackofficeSession", () => {
  it("ends every open session of every user, the actor's own included", async () => {
    const store = storeWithSessions();

    const outcome = await endEveryBackofficeSession({ store }, { actorId: "admin-1", at: AT });

    expect(outcome).toEqual({ kind: "ended" });
    expect(store.current.sessions).toEqual([
      { id: "s-admin", userId: "admin-1", revokedAt: AT },
      { id: "s-1", userId: "u-1", revokedAt: AT },
      { id: "s-2", userId: "u-2", revokedAt: AT },
      { id: "s-old", userId: "u-1", revokedAt: EARLIER },
    ]);
  });

  it("audits one record per ended session with the actor's id, and none for one already ended", async () => {
    const store = storeWithSessions();

    await endEveryBackofficeSession({ store }, { actorId: "admin-1", at: AT });

    expect(store.current.audits).toEqual([
      { actorId: "admin-1", session: { id: "s-admin", userId: "admin-1" }, at: AT },
      { actorId: "admin-1", session: { id: "s-1", userId: "u-1" }, at: AT },
      { actorId: "admin-1", session: { id: "s-2", userId: "u-2" }, at: AT },
    ]);
  });

  it("audits nothing when no session is open", async () => {
    const store = new FakeBackofficeSessionEndingStore();

    const outcome = await endEveryBackofficeSession({ store }, { actorId: "admin-1", at: AT });

    expect(outcome).toEqual({ kind: "ended" });
    expect(store.current.audits).toEqual([]);
  });

  it("leaves every session open when an audit record cannot be written", async () => {
    const store = storeWithSessions();
    const before = store.snapshot();
    store.failingWrites.add("recordSessionEnded");

    await expect(
      endEveryBackofficeSession({ store }, { actorId: "admin-1", at: AT }),
    ).rejects.toThrow("recordSessionEnded failed");

    expect(store.current).toEqual(before);
  });
});
