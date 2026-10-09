import { describe, expect, it } from "vitest";
import { signOut } from "./sign-out.js";
import { FakeSessionStore } from "./test-support/fake-sessions.js";

describe("signOut", () => {
  it("revokes the session at the given moment", async () => {
    const store = new FakeSessionStore();
    const at = new Date("2026-10-01T12:00:00.000Z");

    const outcome = await signOut({ store }, { sessionKey: "key-1", at });

    expect(outcome).toEqual({ kind: "signed_out" });
    expect(store.endedSessions).toEqual([{ sessionKey: "key-1", at }]);
    expect(store.recordedActivity).toEqual([]);
  });
});
