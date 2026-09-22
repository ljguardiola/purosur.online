import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordRecoveryRequestAttempt } from "./recovery-rate-limiter.js";

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

describe("recordRecoveryRequestAttempt", () => {
  it("allows the first request for a fresh destination and source address", async () => {
    const result = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(result.allowed).toBe(true);
  });

  it("allows up to 5 requests per hour for the same destination address, then rejects the 6th", async () => {
    const attempt = (sourceAddress: string) =>
      recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress,
        now: NOON,
      });

    for (let i = 0; i < 5; i++) {
      // A different source address each time isolates the destination limit from the source one.
      expect((await attempt(`203.0.113.${i}`)).allowed).toBe(true);
    }

    expect((await attempt("203.0.113.99")).allowed).toBe(false);
  });

  it("allows up to 10 requests per hour from the same source address, then rejects the 11th", async () => {
    const attempt = (destinationAddress: string) =>
      recordRecoveryRequestAttempt(db, {
        destinationAddress,
        sourceAddress: "203.0.113.10",
        now: NOON,
      });

    for (let i = 0; i < 10; i++) {
      expect((await attempt(`user${i}@example.com`)).allowed).toBe(true);
    }

    expect((await attempt("one-too-many@example.com")).allowed).toBe(false);
  });

  it("does not let one destination address's count affect another", async () => {
    for (let i = 0; i < 5; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress: `203.0.113.${i}`,
        now: NOON,
      });
    }

    const result = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "grace@example.com",
      sourceAddress: "203.0.113.50",
      now: NOON,
    });

    expect(result.allowed).toBe(true);
  });

  it("resets the destination count once the hourly window rolls over", async () => {
    for (let i = 0; i < 5; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress: `203.0.113.${i}`,
        now: NOON,
      });
    }
    const withinTheSameHour = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.99",
      now: NOON,
    });
    expect(withinTheSameHour.allowed).toBe(false);

    const nextHour = new Date(NOON.getTime() + 60 * 60 * 1000);
    const afterRollover = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.100",
      now: nextHour,
    });

    expect(afterRollover.allowed).toBe(true);
  });
});
