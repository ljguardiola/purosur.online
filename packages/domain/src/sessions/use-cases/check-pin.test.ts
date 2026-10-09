import { describe, expect, it } from "vitest";
import {
  PIN_SIGN_IN_LOCKOUT_FAILURES,
  pinSignInAttemptsLeft,
  pinSignInDelaySeconds,
} from "../model/pin-sign-in-failures.js";
import { checkPin } from "./check-pin.js";
import { pinCheckFixture } from "./test-support/fake-pin-sign-in-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const ACCESS = { isAdministrator: false, permissionKeys: [] };

function fixture() {
  const created = pinCheckFixture(NOW);
  created.store.seedHolder("person-1", { firstName: "Ana", access: ACCESS, credential: "123456" });
  return created;
}

function check(created: ReturnType<typeof fixture>, pin: string) {
  return checkPin(created.ports, { userId: "person-1", credential: "123456", pin });
}

describe("checkPin", () => {
  it("accepts the right PIN and clears the person's failures", async () => {
    const created = fixture();
    created.store.seedFailures("person-1", {
      consecutiveFailures: 2,
      lastFailedAt: new Date(NOW.getTime() - 60_000),
    });

    expect(await check(created, "123456")).toEqual({ kind: "right_pin" });
    expect(created.store.failures.has("person-1")).toBe(false);
  });

  it("refuses a wrong PIN with the wait and attempts left of the recorded failure", async () => {
    const created = fixture();
    created.store.seedFailures("person-1", {
      consecutiveFailures: 2,
      lastFailedAt: new Date(NOW.getTime() - 60_000),
    });

    expect(await check(created, "000000")).toEqual({
      kind: "wrong_pin",
      retryAfterSeconds: pinSignInDelaySeconds(3),
      attemptsLeft: pinSignInAttemptsLeft(3),
    });
    expect(created.store.failures.get("person-1")).toEqual({
      consecutiveFailures: 3,
      lastFailedAt: NOW,
    });
  });

  it("locks the person on the failure that reaches the lockout", async () => {
    const created = fixture();
    created.store.seedFailures("person-1", {
      consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES - 1,
      lastFailedAt: new Date(NOW.getTime() - 60_000),
    });

    expect(await check(created, "000000")).toEqual({
      kind: "locked",
      consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES,
    });
  });

  it("refuses a locked person without matching or counting, even with the right PIN", async () => {
    const created = fixture();
    created.store.seedFailures("person-1", {
      consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES,
      lastFailedAt: new Date(NOW.getTime() - 60_000),
    });

    expect(await check(created, "123456")).toEqual({
      kind: "locked",
      consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES,
    });
    expect(created.matching.matched).toEqual([]);
    expect(created.store.failures.get("person-1")?.consecutiveFailures).toBe(
      PIN_SIGN_IN_LOCKOUT_FAILURES,
    );
  });

  it("refuses while the wait after the last failure has not passed, without matching or counting", async () => {
    const created = fixture();
    const lastFailedAt = new Date(NOW.getTime() - 1_000);
    created.store.seedFailures("person-1", { consecutiveFailures: 4, lastFailedAt });

    expect(await check(created, "123456")).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: pinSignInDelaySeconds(4) - 1,
      attemptsLeft: pinSignInAttemptsLeft(4),
    });
    expect(created.matching.matched).toEqual([]);
    expect(created.store.failures.get("person-1")).toEqual({
      consecutiveFailures: 4,
      lastFailedAt,
    });
  });

  it("is unavailable, counting nothing, when no matcher can be had", async () => {
    const created = fixture();
    created.matching.unavailable = true;

    expect(await check(created, "123456")).toEqual({ kind: "unavailable" });
    expect(created.store.failures.has("person-1")).toBe(false);
  });

  it("still refuses a locked person when no matcher can be had", async () => {
    const created = fixture();
    created.matching.unavailable = true;
    created.store.seedFailures("person-1", {
      consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES,
      lastFailedAt: NOW,
    });

    expect(await check(created, "123456")).toEqual({
      kind: "locked",
      consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES,
    });
  });

  it("records the failure before the match resolves", async () => {
    const created = fixture();
    created.matching.hold();

    const pending = check(created, "123456");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(created.store.failures.get("person-1")?.consecutiveFailures).toBe(1);
    created.matching.release();
    expect(await pending).toEqual({ kind: "right_pin" });
    expect(created.store.failures.has("person-1")).toBe(false);
  });

  it("admits only one of two concurrent checks at the wait threshold", async () => {
    const created = fixture();
    created.store.seedFailures("person-1", {
      consecutiveFailures: 2,
      lastFailedAt: new Date(NOW.getTime() - 60_000),
    });
    created.matching.hold();

    const first = check(created, "000000");
    const second = check(created, "000000");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    created.matching.release();

    const outcomes = await Promise.all([first, second]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["rate_limited", "wrong_pin"]);
    expect(created.matching.matched).toHaveLength(1);
  });

  it("withdraws the failure and rethrows when matching throws", async () => {
    const created = fixture();
    created.matching.failure = new Error("hashing failed");
    created.store.seedFailures("person-1", {
      consecutiveFailures: 1,
      lastFailedAt: new Date(NOW.getTime() - 60_000),
    });

    await expect(check(created, "123456")).rejects.toThrow("hashing failed");
    expect(created.store.failures.get("person-1")?.consecutiveFailures).toBe(1);
  });

  it("matches the pin against the credential it was given", async () => {
    const created = fixture();

    await check(created, "123456");

    expect(created.matching.matched).toEqual([{ pin: "123456", credential: "123456" }]);
  });
});
