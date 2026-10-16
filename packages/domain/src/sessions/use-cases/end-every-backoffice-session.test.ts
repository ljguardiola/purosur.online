import { describe, expect, it } from "vitest";
import { SESSION_ABSOLUTE_TIMEOUT_MS, SESSION_IDLE_TIMEOUT_MS } from "../model/session-expiry.js";
import { endEveryBackofficeSession } from "./end-every-backoffice-session.js";
import { FakeBackofficeSessionEndingStore } from "./test-support/fake-backoffice-session-ending-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-10-01T09:00:00.000Z");
const ONE_MINUTE_MS = 60 * 1000;

function msBefore(at: Date, ms: number): Date {
  return new Date(at.getTime() - ms);
}

function openSession(id: string, userId: string) {
  return {
    id,
    userId,
    createdAt: EARLIER,
    lastSeenAt: msBefore(AT, ONE_MINUTE_MS),
    revokedAt: null,
  };
}

function storeWithSessions() {
  const store = new FakeBackofficeSessionEndingStore();
  store.seedSession(openSession("s-admin", "admin-1"));
  store.seedSession(openSession("s-1", "u-1"));
  store.seedSession(openSession("s-2", "u-2"));
  store.seedSession({ ...openSession("s-old", "u-1"), revokedAt: EARLIER });
  return store;
}

describe("endEveryBackofficeSession", () => {
  it("ends every open session of every user, the actor's own included", async () => {
    const store = storeWithSessions();

    const outcome = await endEveryBackofficeSession({ store }, { actorId: "admin-1", at: AT });

    expect(outcome).toEqual({ kind: "ended" });
    expect(store.current.sessions.map(({ id, revokedAt }) => ({ id, revokedAt }))).toEqual([
      { id: "s-admin", revokedAt: AT },
      { id: "s-1", revokedAt: AT },
      { id: "s-2", revokedAt: AT },
      { id: "s-old", revokedAt: EARLIER },
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

  it("neither ends nor audits a session that already expired, idle or past its absolute limit", async () => {
    const store = new FakeBackofficeSessionEndingStore();
    store.seedSession(openSession("s-open", "u-1"));
    store.seedSession({
      ...openSession("s-idle", "u-2"),
      lastSeenAt: msBefore(AT, SESSION_IDLE_TIMEOUT_MS),
    });
    store.seedSession({
      ...openSession("s-too-old", "u-3"),
      createdAt: msBefore(AT, SESSION_ABSOLUTE_TIMEOUT_MS),
    });

    await endEveryBackofficeSession({ store }, { actorId: "admin-1", at: AT });

    expect(store.current.sessions.map(({ id, revokedAt }) => ({ id, revokedAt }))).toEqual([
      { id: "s-open", revokedAt: AT },
      { id: "s-idle", revokedAt: null },
      { id: "s-too-old", revokedAt: null },
    ]);
    expect(store.current.audits).toEqual([
      { actorId: "admin-1", session: { id: "s-open", userId: "u-1" }, at: AT },
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
