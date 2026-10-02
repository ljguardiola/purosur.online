import { describe, expect, it } from "vitest";
import { recordSignInLockout } from "./record-sign-in-lockout.js";
import { FakeSignInLockoutLog } from "./test-support/fake-sign-in-lockout-log.js";

describe("recordSignInLockout", () => {
  it("records the lockout of the source address", async () => {
    const log = new FakeSignInLockoutLog();
    const blockedUntil = new Date("2026-10-01T12:15:00.000Z");

    const outcome = await recordSignInLockout(
      { log },
      { lockoutId: "lockout-1", sourceAddress: "203.0.113.10", failureCount: 5, blockedUntil },
    );

    expect(outcome).toEqual({ kind: "recorded" });
    expect(log.recorded).toEqual([
      { lockoutId: "lockout-1", sourceAddress: "203.0.113.10", failureCount: 5, blockedUntil },
    ]);
  });
});
