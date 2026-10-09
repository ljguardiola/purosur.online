import { describe, expect, it } from "vitest";
import { endExpiredSession } from "./end-expired-session.js";
import { FakeSessionStore } from "./test-support/fake-sessions.js";

describe("endExpiredSession", () => {
  it("revokes the session at the given moment", async () => {
    const store = new FakeSessionStore();
    const at = new Date("2026-10-01T12:00:00.000Z");

    const outcome = await endExpiredSession({ store }, { sessionKey: "key-1", at });

    expect(outcome).toEqual({ kind: "ended" });
    expect(store.endedSessions).toEqual([{ sessionKey: "key-1", at }]);
    expect(store.recordedActivity).toEqual([]);
  });
});
