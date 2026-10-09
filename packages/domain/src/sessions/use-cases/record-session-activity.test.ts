import { describe, expect, it } from "vitest";
import { recordSessionActivity } from "./record-session-activity.js";
import { FakeSessionStore } from "./test-support/fake-sessions.js";

describe("recordSessionActivity", () => {
  it("records the session as seen at the given moment", async () => {
    const store = new FakeSessionStore();
    const at = new Date("2026-10-01T12:00:00.000Z");

    const outcome = await recordSessionActivity({ store }, { sessionKey: "key-1", at });

    expect(outcome).toEqual({ kind: "recorded" });
    expect(store.recordedActivity).toEqual([{ sessionKey: "key-1", at }]);
    expect(store.endedSessions).toEqual([]);
  });
});
