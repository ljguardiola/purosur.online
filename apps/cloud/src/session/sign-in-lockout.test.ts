import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkSignInLockout,
  hashSourceAddress,
  recordSignInFailure,
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

async function fail(sourceAddress: string, now: Date) {
  return recordSignInFailure(db, { sourceAddress, now });
}

describe("checkSignInLockout", () => {
  it("does not block a source address with no recorded failures", async () => {
    const result = await checkSignInLockout(db, "203.0.113.10", NOON);

    expect(result).toEqual({ blocked: false });
  });

  it("blocks a source address whose block has not yet expired", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
      await fail("203.0.113.10", NOON);
    }

    const result = await checkSignInLockout(db, "203.0.113.10", NOON);

    expect(result).toEqual({
      blocked: true,
      blockedUntil: new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
    });
  });

  it("no longer blocks once the block duration has passed", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
      await fail("203.0.113.10", NOON);
    }

    const result = await checkSignInLockout(
      db,
      "203.0.113.10",
      new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
    );

    expect(result).toEqual({ blocked: false });
  });

  it("never blocks a different source address", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT; i++) {
      await fail("203.0.113.10", NOON);
    }

    const result = await checkSignInLockout(db, "203.0.113.99", NOON);

    expect(result).toEqual({ blocked: false });
  });
});

describe("recordSignInFailure", () => {
  it("does not trip the lockout before the limit is reached", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT - 1; i++) {
      const result = await fail("203.0.113.10", NOON);
      expect(result.tripped).toBe(false);
    }
  });

  it("trips the lockout on the failure that reaches the limit, and sets the 15-minute block", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT - 1; i++) {
      await fail("203.0.113.10", NOON);
    }

    const result = await fail("203.0.113.10", NOON);

    if (!result.tripped) {
      throw new Error("test setup: expected the limit-reaching failure to trip the lockout");
    }
    expect(result.lockout).toMatchObject({
      failureCount: SIGN_IN_FAILURE_LIMIT,
      blockedUntil: new Date(NOON.getTime() + SIGN_IN_BLOCK_DURATION_MS),
    });
    expect(typeof result.lockout.id).toBe("string");
  });

  it("does not let one source address's failures count against another", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT - 1; i++) {
      await fail("203.0.113.10", NOON);
    }

    const result = await fail("203.0.113.99", NOON);

    expect(result.tripped).toBe(false);
  });

  it("counts the last 60 minutes, not the current clock hour, so a lockout does not lift on the hour", async () => {
    for (let i = 0; i < SIGN_IN_FAILURE_LIMIT - 1; i++) {
      await fail("203.0.113.10", minutesAfterNoon(59));
    }

    const result = await fail("203.0.113.10", minutesAfterNoon(61));

    expect(result.tripped).toBe(true);
  });

  it("prunes failures that already left the window", async () => {
    await fail("203.0.113.10", NOON);

    const rows = await client.query<{ source_address: string }>(
      "select source_address from sign_in_failures",
    );
    expect(rows.rows).toHaveLength(1);

    await fail("203.0.113.20", minutesAfterNoon(90));

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
