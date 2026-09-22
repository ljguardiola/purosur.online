import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordRecoveryRequestAttempt, recordRedemptionAttempt } from "./recovery-rate-limiter.js";

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

async function storedKeyValues(): Promise<string[]> {
  const result = await client.query<{ key_value: string }>(
    "select key_value from recovery_rate_limit_attempts",
  );
  return result.rows.map((row) => row.key_value);
}

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

  it("counts the last 60 minutes, not the current clock hour, so a limit never doubles across the hour", async () => {
    for (let i = 0; i < 5; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress: `203.0.113.${i}`,
        now: minutesAfterNoon(59),
      });
    }

    const twoMinutesLater = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.99",
      now: minutesAfterNoon(61),
    });

    expect(twoMinutesLater.allowed).toBe(false);
  });

  it("reports the seconds until the destination's oldest counted request leaves the window", async () => {
    for (let i = 0; i < 5; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress: `203.0.113.${i}`,
        now: minutesAfterNoon(i * 10),
      });
    }

    const rejected = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.99",
      now: minutesAfterNoon(50),
    });

    expect(rejected).toEqual({ allowed: false, retryAfterSeconds: 10 * 60 });
  });

  it("reports the seconds until the source address's oldest counted request leaves the window", async () => {
    for (let i = 0; i < 10; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: `user${i}@example.com`,
        sourceAddress: "203.0.113.10",
        now: minutesAfterNoon(i * 5),
      });
    }

    const rejected = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "one-too-many@example.com",
      sourceAddress: "203.0.113.10",
      now: minutesAfterNoon(45),
    });

    expect(rejected).toEqual({ allowed: false, retryAfterSeconds: 15 * 60 });
  });

  it("admits a request made exactly when the reported wait runs out", async () => {
    for (let i = 0; i < 5; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress: `203.0.113.${i}`,
        now: minutesAfterNoon(i * 10),
      });
    }
    const rejected = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.99",
      now: minutesAfterNoon(50),
    });
    if (rejected.allowed) {
      throw new Error("test setup: expected the sixth request to be rejected");
    }

    const retried = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.100",
      now: new Date(minutesAfterNoon(50).getTime() + rejected.retryAfterSeconds * 1000),
    });

    expect(retried.allowed).toBe(true);
  });

  it("stores the destination address only as its SHA-256 hash", async () => {
    await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    const keyValues = await storedKeyValues();
    expect(keyValues.some((value) => value.includes("ada@example.com"))).toBe(false);
    expect(keyValues).toContain(createHash("sha256").update("ada@example.com").digest("hex"));
  });

  it("prunes attempts that already left the window when a later attempt is recorded", async () => {
    await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    await recordRecoveryRequestAttempt(db, {
      destinationAddress: "grace@example.com",
      sourceAddress: "203.0.113.20",
      now: minutesAfterNoon(90),
    });

    expect(await storedKeyValues()).toHaveLength(2);
    expect(await storedKeyValues()).not.toContain("203.0.113.10");
  });
});

describe("recordRedemptionAttempt", () => {
  it("allows the first redemption attempt from a fresh source address", async () => {
    const result = await recordRedemptionAttempt(db, { sourceAddress: "203.0.113.10", now: NOON });

    expect(result.allowed).toBe(true);
  });

  it("allows up to 10 attempts per hour from the same source address, then rejects the 11th", async () => {
    for (let i = 0; i < 10; i++) {
      const result = await recordRedemptionAttempt(db, {
        sourceAddress: "203.0.113.10",
        now: NOON,
      });
      expect(result.allowed).toBe(true);
    }

    const eleventh = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(eleventh.allowed).toBe(false);
  });

  it("does not share its count with the recovery-request source-address limit", async () => {
    for (let i = 0; i < 10; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: `user${i}@example.com`,
        sourceAddress: "203.0.113.20",
        now: NOON,
      });
    }

    const result = await recordRedemptionAttempt(db, { sourceAddress: "203.0.113.20", now: NOON });

    expect(result.allowed).toBe(true);
  });

  it("resets the count once the hourly window rolls over", async () => {
    for (let i = 0; i < 10; i++) {
      await recordRedemptionAttempt(db, { sourceAddress: "203.0.113.10", now: NOON });
    }
    const withinTheSameHour = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: NOON,
    });
    expect(withinTheSameHour.allowed).toBe(false);

    const nextHour = new Date(NOON.getTime() + 60 * 60 * 1000);
    const afterRollover = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: nextHour,
    });

    expect(afterRollover.allowed).toBe(true);
  });

  it("counts the last 60 minutes, not the current clock hour", async () => {
    for (let i = 0; i < 10; i++) {
      await recordRedemptionAttempt(db, {
        sourceAddress: "203.0.113.10",
        now: minutesAfterNoon(59),
      });
    }

    const twoMinutesLater = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: minutesAfterNoon(61),
    });

    expect(twoMinutesLater.allowed).toBe(false);
  });

  it("reports the seconds until the oldest counted attempt leaves the window", async () => {
    for (let i = 0; i < 10; i++) {
      await recordRedemptionAttempt(db, {
        sourceAddress: "203.0.113.10",
        now: minutesAfterNoon(i),
      });
    }

    const rejected = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: minutesAfterNoon(20),
    });

    expect(rejected).toEqual({ allowed: false, retryAfterSeconds: 40 * 60 });
  });
});
