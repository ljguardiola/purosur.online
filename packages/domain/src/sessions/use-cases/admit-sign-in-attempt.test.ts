import { describe, expect, it } from "vitest";
import { SIGN_IN_BLOCK_DURATION_MS, SIGN_IN_FAILURE_LIMIT } from "../model/sign-in-lockout.js";
import { admitSignInAttempt } from "./admit-sign-in-attempt.js";
import { FakeSignInLockoutStore } from "./test-support/fake-sign-in-lockout-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const ADDRESS = "203.0.113.10";
const HOUR_MS = 60 * 60 * 1000;
const BLOCKED_UNTIL = new Date(AT.getTime() + SIGN_IN_BLOCK_DURATION_MS);

function admit(store: FakeSignInLockoutStore, at = AT, sourceAddress = ADDRESS) {
  return admitSignInAttempt({ store }, { sourceAddress, at });
}

describe("admitSignInAttempt", () => {
  it("admits an address with nothing recorded against it and records the attempt", async () => {
    const store = new FakeSignInLockoutStore();

    const admission = await admit(store);

    expect(admission).toEqual({ admitted: true, attemptId: "failure-1" });
    expect(store.current.failures).toEqual([
      { id: "failure-1", sourceAddress: ADDRESS, attemptedAt: AT },
    ]);
  });

  it("admits the attempt that will reach the limit", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT - 1);

    const admission = await admit(store);

    expect(admission).toMatchObject({ admitted: true });
  });

  it("refuses an attempt while the block is live, without recording it or tripping again", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedLockout({ id: "lockout-9", sourceAddress: ADDRESS, blockedUntil: BLOCKED_UNTIL });
    const before = store.snapshot();

    const admission = await admit(store, new Date(BLOCKED_UNTIL.getTime() - 1));

    expect(admission).toEqual({
      admitted: false,
      blockedUntil: BLOCKED_UNTIL,
      trippedLockout: null,
    });
    expect(store.current).toEqual(before);
  });

  it("admits again once the block is over", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedLockout({ id: "lockout-9", sourceAddress: ADDRESS, blockedUntil: AT });

    const admission = await admit(store);

    expect(admission).toMatchObject({ admitted: true });
  });

  it("refuses an attempt while the limit's worth of attempts are unsettled, tripping the lockout and its alert", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT);

    const admission = await admit(store);

    expect(admission).toEqual({
      admitted: false,
      blockedUntil: BLOCKED_UNTIL,
      trippedLockout: {
        id: "lockout-11",
        blockedUntil: BLOCKED_UNTIL,
        failureCount: SIGN_IN_FAILURE_LIMIT,
      },
    });
    expect(store.current).toEqual({
      failures: [],
      lockouts: [{ id: "lockout-11", sourceAddress: ADDRESS, blockedUntil: BLOCKED_UNTIL }],
      alerts: [
        {
          sourceAddress: ADDRESS,
          failureCount: SIGN_IN_FAILURE_LIMIT,
          blockedUntil: BLOCKED_UNTIL,
          openedAt: AT,
        },
      ],
    });
  });

  it("counts only the attempts of its own source address", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures("203.0.113.99", AT, SIGN_IN_FAILURE_LIMIT);

    const admission = await admit(store);

    expect(admission).toMatchObject({ admitted: true });
  });

  it("counts the attempts of the last hour and prunes the ones that left it", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures(ADDRESS, new Date(AT.getTime() - HOUR_MS), SIGN_IN_FAILURE_LIMIT);
    store.seedFailures("203.0.113.99", new Date(AT.getTime() - HOUR_MS + 1), 1);

    const admission = await admit(store);

    expect(admission).toMatchObject({ admitted: true });
    expect(store.current.failures.map((held) => held.sourceAddress)).toEqual([
      "203.0.113.99",
      ADDRESS,
    ]);
  });

  it("locks the address, then prunes, checks its block, counts and records, in one transaction", async () => {
    const store = new FakeSignInLockoutStore();

    await admit(store);

    expect(store.operationOrder).toEqual([
      "lockSourceAddress",
      "pruneFailuresOutsideWindow",
      "findBlockedUntil",
      "countFailuresInWindow",
      "recordFailure",
    ]);
    expect(store.lockedAddresses).toEqual([ADDRESS]);
    expect(store.transactions).toBe(1);
  });

  it("stops at the live block without counting", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedLockout({ id: "lockout-9", sourceAddress: ADDRESS, blockedUntil: BLOCKED_UNTIL });

    await admit(store);

    expect(store.operationOrder).toEqual([
      "lockSourceAddress",
      "pruneFailuresOutsideWindow",
      "findBlockedUntil",
    ]);
  });

  it("blocks the address and then opens the alert when it trips", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT);

    await admit(store);

    expect(store.operationOrder).toEqual([
      "lockSourceAddress",
      "pruneFailuresOutsideWindow",
      "findBlockedUntil",
      "countFailuresInWindow",
      "blockSourceAddress",
      "openLockoutAlert",
    ]);
  });

  it.each(["blockSourceAddress", "openLockoutAlert"] as const)(
    "leaves the failures unsettled and no lockout when %s fails",
    async (failing) => {
      const store = new FakeSignInLockoutStore();
      store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT);
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(admit(store)).rejects.toThrow(`${failing} failed`);

      expect(store.current).toEqual(before);
    },
  );

  it("leaves nothing recorded and nothing pruned when recording the attempt fails", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures("203.0.113.99", new Date(AT.getTime() - HOUR_MS), 1);
    const before = store.snapshot();
    store.failingWrites.add("recordFailure");

    await expect(admit(store)).rejects.toThrow("recordFailure failed");

    expect(store.current).toEqual(before);
  });

  it("checks nothing and records nothing when the prune fails", async () => {
    const store = new FakeSignInLockoutStore();
    const before = store.snapshot();
    store.failingWrites.add("pruneFailuresOutsideWindow");

    await expect(admit(store)).rejects.toThrow("pruneFailuresOutsideWindow failed");

    expect(store.operationOrder).toEqual(["lockSourceAddress", "pruneFailuresOutsideWindow"]);
    expect(store.current).toEqual(before);
  });
});
