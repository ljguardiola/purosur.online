import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  admitSignInAttempt,
  confirmRejectedSignInAttempt,
  discardSignInAttempt,
  hashSourceAddress,
  SIGN_IN_BLOCK_DURATION_MS,
  SIGN_IN_FAILURE_LIMIT,
  type TrippedSignInLockout,
} from "./sign-in-lockout.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let client: TestDatabase["client"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  client = testDatabase.client;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

const NOON = new Date("2026-01-05T12:00:00.000Z");
const MINUTE_MS = 60 * 1000;

function minutesAfterNoon(minutes: number): Date {
  return new Date(NOON.getTime() + minutes * MINUTE_MS);
}

function attempt(sourceAddress: string, now: Date) {
  return admitSignInAttempt(db, { sourceAddress, now });
}

/** One whole attempt that the credential check went on to reject, settled as such. */
async function rejectedAttempt(
  sourceAddress: string,
  now: Date,
): Promise<TrippedSignInLockout | null> {
  const admission = await attempt(sourceAddress, now);
  if (!admission.admitted) {
    throw new Error("test setup: expected this attempt to be admitted");
  }
  const confirmed = await confirmRejectedSignInAttempt(db, { sourceAddress, now });
  return confirmed.trippedLockout;
}

async function rejectedAttempts(sourceAddress: string, now: Date, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await rejectedAttempt(sourceAddress, now);
  }
}

describe("admitSignInAttempt", () => {
  it("admits an attempt from a source address with nothing recorded against it", async () => {
    const admission = await attempt("203.0.113.10", NOON);

    expect(admission.admitted).toBe(true);
  });

  it("admits the attempt that will reach the limit, so it is answered as the rejection it is", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT - 1);

    const admission = await attempt("203.0.113.10", NOON);

    expect(admission.admitted).toBe(true);
  });

  it("refuses the next attempt once the block is set", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);

    const admission = await attempt("203.0.113.10", NOON);

    expect(admission).toMatchObject({
      admitted: false,
      blockedUntil: new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
      trippedLockout: null,
    });
  });

  it("caps a burst at the limit by refusing an attempt while that many are still unsettled", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
      const admission = await attempt("203.0.113.10", NOON);
      expect(admission.admitted).toBe(true);
    }

    const admission = await attempt("203.0.113.10", NOON);

    if (admission.admitted) {
      throw new Error("test setup: expected the attempt past the limit to be refused");
    }
    expect(admission.trippedLockout).toMatchObject({ failureCount: SIGN_IN_FAILURE_LIMIT });
  });

  it("keeps blocking for the whole 15 minutes", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);

    const admission = await attempt(
      "203.0.113.10",
      new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS - 1),
    );

    expect(admission.admitted).toBe(false);
  });

  it("admits again as soon as the 15 minutes are up, instead of blocking out the hour", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);

    const admission = await attempt(
      "203.0.113.10",
      new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
    );

    expect(admission.admitted).toBe(true);
  });

  it("makes the next block need its own ten rejected attempts, not one more on top of the old ten", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);
    const afterBlock = new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS);

    await rejectedAttempts("203.0.113.10", afterBlock, SIGN_IN_FAILURE_LIMIT - 1);
    const stillAdmitted = await attempt("203.0.113.10", afterBlock);

    expect(stillAdmitted.admitted).toBe(true);
  });

  it("does not count an attempt that was discarded", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT - 1);
    const discarded = await attempt("203.0.113.10", NOON);
    if (!discarded.admitted) {
      throw new Error("test setup: expected the attempt to be admitted");
    }

    await discardSignInAttempt(db, discarded.attemptId);
    const confirmed = await confirmRejectedSignInAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(confirmed.trippedLockout).toBeNull();
  });

  it("does not let one source address's attempts count against another", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);

    const admission = await attempt("203.0.113.99", NOON);

    expect(admission.admitted).toBe(true);
  });

  it("counts the last 60 minutes, not the current clock hour, so a lockout does not lift on the hour", async () => {
    await rejectedAttempts("203.0.113.10", minutesAfterNoon(59), SIGN_IN_FAILURE_LIMIT);

    const admission = await attempt("203.0.113.10", minutesAfterNoon(61));

    expect(admission.admitted).toBe(false);
  });

  it("prunes attempts that already left the window", async () => {
    await rejectedAttempt("203.0.113.10", NOON);

    const rows = await client.query<{ source_address: string }>(
      "select source_address from sign_in_failures",
    );
    expect(rows.rows).toHaveLength(1);

    await rejectedAttempt("203.0.113.20", minutesAfterNoon(90));

    const rowsAfter = await client.query<{ source_address: string }>(
      "select source_address from sign_in_failures",
    );
    expect(rowsAfter.rows.map((row) => row.source_address)).toEqual(["203.0.113.20"]);
  });
});

describe("confirmRejectedSignInAttempt", () => {
  it("does not block an address that has not reached the limit", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT - 1; i++) {
      const tripped = await rejectedAttempt("203.0.113.10", NOON);
      expect(tripped).toBeNull();
    }
  });

  it("blocks on the attempt that reaches the limit, for 15 minutes", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT - 1);

    const tripped = await rejectedAttempt("203.0.113.10", NOON);

    expect(tripped).toMatchObject({
      failureCount: SIGN_IN_FAILURE_LIMIT,
      blockedUntil: new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
    });
    expect(typeof tripped?.id).toBe("string");
  });

  it("reports the block once, so each block is audited a single time", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);

    const confirmed = await confirmRejectedSignInAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(confirmed.trippedLockout).toBeNull();
  });
});

describe("hashSourceAddress", () => {
  it("hashes the address with SHA-256, hex-encoded", () => {
    expect(hashSourceAddress("203.0.113.10")).toBe(
      createHash("sha256").update("203.0.113.10").digest("hex"),
    );
  });
});
