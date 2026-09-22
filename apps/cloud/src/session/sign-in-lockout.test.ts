import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  admitSignInAttempt,
  discardSignInAttempt,
  hashSourceAddress,
  SIGN_IN_BLOCK_DURATION_MS,
  SIGN_IN_FAILURE_LIMIT,
} from "./sign-in-lockout.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(async () => {
  await client.close();
});

const NOON = new Date("2026-01-05T12:00:00.000Z");
const MINUTE_MS = 60 * 1000;

function minutesAfterNoon(minutes: number): Date {
  return new Date(NOON.getTime() + minutes * MINUTE_MS);
}

function attempt(sourceAddress: string, now: Date) {
  return admitSignInAttempt(db, { sourceAddress, now });
}

/** An attempt that was admitted and then rejected by the credential check, so it stays counted. */
async function rejectedAttempt(sourceAddress: string, now: Date): Promise<void> {
  const admission = await attempt(sourceAddress, now);
  if (!admission.admitted) {
    throw new Error("test setup: expected this attempt to be admitted");
  }
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

  it("admits attempts up to the limit and blocks the one that finds it reached", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);

    const admission = await attempt("203.0.113.10", NOON);

    expect(admission).toMatchObject({
      admitted: false,
      blockedUntil: new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
    });
  });

  it("reports the block it set, once, so each block is audited a single time", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);

    const tripping = await attempt("203.0.113.10", NOON);
    const next = await attempt("203.0.113.10", NOON);

    if (tripping.admitted || next.admitted) {
      throw new Error("test setup: expected both attempts to be blocked");
    }
    expect(tripping.trippedLockout).toMatchObject({
      failureCount: SIGN_IN_FAILURE_LIMIT,
      blockedUntil: new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
    });
    expect(typeof tripping.trippedLockout?.id).toBe("string");
    expect(next.trippedLockout).toBeNull();
  });

  it("keeps blocking for the whole 15 minutes", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);
    await attempt("203.0.113.10", NOON);

    const admission = await attempt(
      "203.0.113.10",
      new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS - 1),
    );

    expect(admission.admitted).toBe(false);
  });

  it("admits again as soon as the 15 minutes are up, instead of blocking out the hour", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);
    await attempt("203.0.113.10", NOON);

    const admission = await attempt(
      "203.0.113.10",
      new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
    );

    expect(admission.admitted).toBe(true);
  });

  it("makes the next block need its own ten rejected attempts, not one more on top of the old ten", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT);
    await attempt("203.0.113.10", NOON);
    const afterBlock = new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS);

    await rejectedAttempts("203.0.113.10", afterBlock, SIGN_IN_FAILURE_LIMIT - 1);
    const withinLimit = await attempt("203.0.113.10", afterBlock);
    const overLimit = await attempt("203.0.113.10", afterBlock);

    expect(withinLimit.admitted).toBe(true);
    expect(overLimit.admitted).toBe(false);
  });

  it("does not count an attempt that was discarded", async () => {
    await rejectedAttempts("203.0.113.10", NOON, SIGN_IN_FAILURE_LIMIT - 1);
    const discarded = await attempt("203.0.113.10", NOON);
    if (!discarded.admitted) {
      throw new Error("test setup: expected the attempt to be admitted");
    }

    await discardSignInAttempt(db, discarded.attemptId);
    const admission = await attempt("203.0.113.10", NOON);

    expect(admission.admitted).toBe(true);
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

describe("hashSourceAddress", () => {
  it("hashes the address with SHA-256, hex-encoded", () => {
    expect(hashSourceAddress("203.0.113.10")).toBe(
      createHash("sha256").update("203.0.113.10").digest("hex"),
    );
  });
});
