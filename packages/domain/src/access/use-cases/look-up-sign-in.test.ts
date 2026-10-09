import { describe, expect, it } from "vitest";
import { lookUpSignIn } from "./look-up-sign-in.js";
import { FakeSignInLookupStore } from "./test-support/fake-sign-in-lookup-store.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const REGISTER = "register-1";
const EMAIL = "ada@example.com";

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function lookUp(store: FakeSignInLookupStore, input: { registerId?: string; email?: string } = {}) {
  return lookUpSignIn(
    { store, clock: new FixedClock(NOW) },
    { registerId: REGISTER, email: EMAIL, ...input },
  );
}

describe("lookUpSignIn", () => {
  it("finds a person of the register's branch who has a PIN", async () => {
    const store = new FakeSignInLookupStore();
    store.seedCandidate(REGISTER, EMAIL, { userId: "person-1", hasPin: true });

    expect(await lookUp(store)).toEqual({ kind: "found", userId: "person-1", hasPin: true });
  });

  it("finds a person who has no PIN yet and says so", async () => {
    const store = new FakeSignInLookupStore();
    store.seedCandidate(REGISTER, EMAIL, { userId: "person-1", hasPin: false });

    expect(await lookUp(store)).toEqual({ kind: "found", userId: "person-1", hasPin: false });
  });

  it("answers not found when nobody of the register's branch has that email", async () => {
    const store = new FakeSignInLookupStore();
    store.seedCandidate("register-2", EMAIL, { userId: "person-1", hasPin: true });

    expect(await lookUp(store)).toEqual({ kind: "not_found" });
  });

  it("counts a lookup that found somebody and one that found nobody", async () => {
    const store = new FakeSignInLookupStore();
    store.seedCandidate(REGISTER, EMAIL, { userId: "person-1", hasPin: true });

    await lookUp(store);
    await lookUp(store, { email: "nobody@example.com" });

    expect(store.snapshot().attempts).toEqual([
      { registerId: REGISTER, attemptedAt: NOW },
      { registerId: REGISTER, attemptedAt: NOW },
    ]);
  });

  it("locks the register's lookups, then counts them, then records the attempt, then searches", async () => {
    const store = new FakeSignInLookupStore();

    await lookUp(store);

    expect(store.lockedRegisters).toEqual([REGISTER]);
    expect(store.operationOrder).toEqual([
      "lockSignInLookupAttempts",
      "acceptedSignInLookupAttempts",
      "recordSignInLookupAttempt",
      "findSignInCandidate",
    ]);
  });

  it("accepts the tenth lookup of the hour", async () => {
    const store = new FakeSignInLookupStore();
    for (const minutes of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      store.seedAttempt(REGISTER, minutesAgo(minutes));
    }

    expect(await lookUp(store)).toEqual({ kind: "not_found" });
  });

  it("refuses the eleventh lookup of the hour with the wait until the oldest leaves it, recording and searching nothing", async () => {
    const store = new FakeSignInLookupStore();
    store.seedCandidate(REGISTER, EMAIL, { userId: "person-1", hasPin: true });
    for (const minutes of [1, 2, 3, 4, 5, 6, 7, 8, 9, 50]) {
      store.seedAttempt(REGISTER, minutesAgo(minutes));
    }

    const outcome = await lookUp(store);

    expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 10 * 60 });
    expect(store.snapshot().attempts).toHaveLength(10);
    expect(store.searches).toEqual([]);
  });

  it("counts only the asking register's lookups and only those of the last hour", async () => {
    const store = new FakeSignInLookupStore();
    for (let count = 0; count < 10; count += 1) {
      store.seedAttempt("register-2", minutesAgo(1));
    }
    for (let count = 0; count < 10; count += 1) {
      store.seedAttempt(REGISTER, minutesAgo(61));
    }

    expect(await lookUp(store)).toEqual({ kind: "not_found" });
  });
});
