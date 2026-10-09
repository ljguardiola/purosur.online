import { createHash } from "node:crypto";
import {
  RECOVERY_DESTINATION_ADDRESS_LIMIT,
  RECOVERY_RATE_LIMIT_WINDOW_MS,
  RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT,
  RECOVERY_SOURCE_ADDRESS_LIMIT,
} from "@purosur/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { recordRecoveryRequestAttempt, recordRedemptionAttempt } from "./recovery-rate-limiter.js";

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

function secondsLeftInTheWindowAfter(minutes: number): number {
  return (RECOVERY_RATE_LIMIT_WINDOW_MS - minutes * MINUTE_MS) / 1000;
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

  it("allows the destination address's limit of requests in the window, then rejects the next one", async () => {
    const attempt = (sourceAddress: string) =>
      recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress,
        now: NOON,
      });

    for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
      expect((await attempt(`203.0.113.${i}`)).allowed).toBe(true);
    }

    expect((await attempt("203.0.113.99")).allowed).toBe(false);
  });

  it("allows the source address's limit of requests in the window, then rejects the next one", async () => {
    const attempt = (destinationAddress: string) =>
      recordRecoveryRequestAttempt(db, {
        destinationAddress,
        sourceAddress: "203.0.113.10",
        now: NOON,
      });

    for (let i = 0; i < RECOVERY_SOURCE_ADDRESS_LIMIT; i++) {
      expect((await attempt(`user${i}@example.com`)).allowed).toBe(true);
    }

    expect((await attempt("one-too-many@example.com")).allowed).toBe(false);
  });

  it("does not let one destination address's count affect another", async () => {
    for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
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

  it("resets the destination count once the window rolls over", async () => {
    for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
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

    const nextWindow = new Date(NOON.getTime() + RECOVERY_RATE_LIMIT_WINDOW_MS);
    const afterRollover = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.100",
      now: nextWindow,
    });

    expect(afterRollover.allowed).toBe(true);
  });

  it("counts a sliding window, not the current clock hour, so a limit never doubles across the hour", async () => {
    for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
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
    for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress: `203.0.113.${i}`,
        now: minutesAfterNoon(i),
      });
    }

    const rejected = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.99",
      now: minutesAfterNoon(50),
    });

    expect(rejected).toEqual({
      allowed: false,
      retryAfterSeconds: secondsLeftInTheWindowAfter(50),
    });
  });

  it("reports the seconds until the source address's oldest counted request leaves the window", async () => {
    for (let i = 0; i < RECOVERY_SOURCE_ADDRESS_LIMIT; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: `user${i}@example.com`,
        sourceAddress: "203.0.113.10",
        now: minutesAfterNoon(i),
      });
    }

    const rejected = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "one-too-many@example.com",
      sourceAddress: "203.0.113.10",
      now: minutesAfterNoon(45),
    });

    expect(rejected).toEqual({
      allowed: false,
      retryAfterSeconds: secondsLeftInTheWindowAfter(45),
    });
  });

  it("admits a request made exactly when the reported wait runs out", async () => {
    for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: "ada@example.com",
        sourceAddress: `203.0.113.${i}`,
        now: minutesAfterNoon(i),
      });
    }
    const rejected = await recordRecoveryRequestAttempt(db, {
      destinationAddress: "ada@example.com",
      sourceAddress: "203.0.113.99",
      now: minutesAfterNoon(50),
    });
    if (rejected.allowed) {
      throw new Error("test setup: expected the request over the limit to be rejected");
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
      now: new Date(NOON.getTime() + RECOVERY_RATE_LIMIT_WINDOW_MS + 30 * MINUTE_MS),
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

  it("allows the source address's limit of attempts in the window, then rejects the next one", async () => {
    for (let i = 0; i < RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT; i++) {
      const result = await recordRedemptionAttempt(db, {
        sourceAddress: "203.0.113.10",
        now: NOON,
      });
      expect(result.allowed).toBe(true);
    }

    const overTheLimit = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(overTheLimit.allowed).toBe(false);
  });

  it("does not share its count with the recovery-request source-address limit", async () => {
    for (let i = 0; i < RECOVERY_SOURCE_ADDRESS_LIMIT; i++) {
      await recordRecoveryRequestAttempt(db, {
        destinationAddress: `user${i}@example.com`,
        sourceAddress: "203.0.113.20",
        now: NOON,
      });
    }

    const result = await recordRedemptionAttempt(db, { sourceAddress: "203.0.113.20", now: NOON });

    expect(result.allowed).toBe(true);
  });

  it("resets the count once the window rolls over", async () => {
    for (let i = 0; i < RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT; i++) {
      await recordRedemptionAttempt(db, { sourceAddress: "203.0.113.10", now: NOON });
    }
    const withinTheSameHour = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: NOON,
    });
    expect(withinTheSameHour.allowed).toBe(false);

    const nextWindow = new Date(NOON.getTime() + RECOVERY_RATE_LIMIT_WINDOW_MS);
    const afterRollover = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: nextWindow,
    });

    expect(afterRollover.allowed).toBe(true);
  });

  it("counts a sliding window, not the current clock hour", async () => {
    for (let i = 0; i < RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT; i++) {
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
    for (let i = 0; i < RECOVERY_REDEMPTION_SOURCE_ADDRESS_LIMIT; i++) {
      await recordRedemptionAttempt(db, {
        sourceAddress: "203.0.113.10",
        now: minutesAfterNoon(i),
      });
    }

    const rejected = await recordRedemptionAttempt(db, {
      sourceAddress: "203.0.113.10",
      now: minutesAfterNoon(20),
    });

    expect(rejected).toEqual({
      allowed: false,
      retryAfterSeconds: secondsLeftInTheWindowAfter(20),
    });
  });
});
