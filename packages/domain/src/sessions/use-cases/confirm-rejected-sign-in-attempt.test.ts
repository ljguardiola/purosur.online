import { describe, expect, it } from "vitest";
import { SIGN_IN_BLOCK_DURATION_MS, SIGN_IN_FAILURE_LIMIT } from "../model/sign-in-lockout.js";
import { confirmRejectedSignInAttempt } from "./confirm-rejected-sign-in-attempt.js";
import { FakeSignInLockoutStore } from "./test-support/fake-sign-in-lockout-store.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const ADDRESS = "203.0.113.10";
const BLOCKED_UNTIL = new Date(AT.getTime() + SIGN_IN_BLOCK_DURATION_MS);

function confirm(store: FakeSignInLockoutStore, at = AT) {
  return confirmRejectedSignInAttempt({ store }, { sourceAddress: ADDRESS, at });
}

describe("confirmRejectedSignInAttempt", () => {
  it("trips nothing for an address that has not reached the limit", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT - 1);
    const before = store.snapshot();

    const confirmed = await confirm(store);

    expect(confirmed).toEqual({ trippedLockout: null });
    expect(store.current).toEqual(before);
  });

  it("blocks the address for the block duration on the attempt that reaches the limit", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT);

    const confirmed = await confirm(store);

    expect(confirmed).toEqual({
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

  it("reports no new block while one is live, so each block is audited once", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT);
    store.seedLockout({ id: "lockout-9", sourceAddress: ADDRESS, blockedUntil: BLOCKED_UNTIL });
    const before = store.snapshot();

    const confirmed = await confirm(store);

    expect(confirmed).toEqual({ trippedLockout: null });
    expect(store.current).toEqual(before);
  });

  it("blocks again, moving the same lockout, once the previous block is over", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedLockout({ id: "lockout-9", sourceAddress: ADDRESS, blockedUntil: AT });
    store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT);

    const confirmed = await confirm(store);

    expect(confirmed.trippedLockout).toMatchObject({ id: "lockout-9" });
    expect(store.current.lockouts).toEqual([
      { id: "lockout-9", sourceAddress: ADDRESS, blockedUntil: BLOCKED_UNTIL },
    ]);
  });

  it("counts only the attempts of its own source address", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures("203.0.113.99", AT, SIGN_IN_FAILURE_LIMIT);

    const confirmed = await confirm(store);

    expect(confirmed).toEqual({ trippedLockout: null });
  });

  it("locks the address, checks its block, counts, blocks and opens the alert, in one transaction without pruning", async () => {
    const store = new FakeSignInLockoutStore();
    store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT);

    await confirm(store);

    expect(store.operationOrder).toEqual([
      "lockSourceAddress",
      "findBlockedUntil",
      "countFailuresInWindow",
      "blockSourceAddress",
      "openLockoutAlert",
    ]);
    expect(store.lockedAddresses).toEqual([ADDRESS]);
    expect(store.transactions).toBe(1);
  });

  it.each(["blockSourceAddress", "openLockoutAlert"] as const)(
    "leaves the failures and no lockout when %s fails",
    async (failing) => {
      const store = new FakeSignInLockoutStore();
      store.seedFailures(ADDRESS, AT, SIGN_IN_FAILURE_LIMIT);
      const before = store.snapshot();
      store.failingWrites.add(failing);

      await expect(confirm(store)).rejects.toThrow(`${failing} failed`);

      expect(store.current).toEqual(before);
    },
  );
});
