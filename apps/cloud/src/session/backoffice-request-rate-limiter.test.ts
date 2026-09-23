import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { recordBackofficeRequest } from "./backoffice-request-rate-limiter.js";

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

async function storedRowCount(): Promise<number> {
  const result = await client.query<{ count: string }>(
    "select count(*)::text as count from backoffice_rate_limit_attempts",
  );
  return Number(result.rows[0]?.count ?? 0);
}

describe("recordBackofficeRequest", () => {
  it("allows the first request for a fresh session and source address", async () => {
    const result = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(result.allowed).toBe(true);
  });

  it("allows a request with no session cookie, counting only against the source address", async () => {
    const result = await recordBackofficeRequest(db, {
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(result.allowed).toBe(true);
    expect(await storedRowCount()).toBe(1);
  });

  it("allows up to 600 requests per hour for the same session, then rejects the 601st", async () => {
    const attempt = (sourceAddress: string) =>
      recordBackofficeRequest(db, { sessionKeyValue: "session-hash-1", sourceAddress, now: NOON });

    for (let i = 0; i < 600; i++) {
      // A different source address each time isolates the session limit from the address one.
      expect((await attempt(`203.0.113.${i % 250}`)).allowed).toBe(true);
    }

    expect((await attempt("203.0.113.99")).allowed).toBe(false);
  });

  it("allows up to 1800 requests per hour from the same source address, then rejects the 1801st", async () => {
    const attempt = (sessionKeyValue: string) =>
      recordBackofficeRequest(db, { sessionKeyValue, sourceAddress: "203.0.113.10", now: NOON });

    for (let i = 0; i < 1800; i++) {
      expect((await attempt(`session-hash-${i}`)).allowed).toBe(true);
    }

    expect((await attempt("session-hash-one-too-many")).allowed).toBe(false);
  }, 30_000);

  it("does not let one session's count affect another", async () => {
    for (let i = 0; i < 600; i++) {
      await recordBackofficeRequest(db, {
        sessionKeyValue: "session-hash-1",
        sourceAddress: `203.0.113.${i % 250}`,
        now: NOON,
      });
    }

    const result = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-2",
      sourceAddress: "203.0.113.250",
      now: NOON,
    });

    expect(result.allowed).toBe(true);
  });

  it("applies the source-address limit across sessions, rejecting a fresh session from the same address", async () => {
    for (let i = 0; i < 1800; i++) {
      await recordBackofficeRequest(db, {
        sessionKeyValue: `session-hash-${i}`,
        sourceAddress: "203.0.113.10",
        now: NOON,
      });
    }

    const result = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-fresh",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(result.allowed).toBe(false);
  }, 30_000);

  it("records nothing for a rejected request", async () => {
    for (let i = 0; i < 600; i++) {
      await recordBackofficeRequest(db, {
        sessionKeyValue: "session-hash-1",
        sourceAddress: `203.0.113.${i % 250}`,
        now: NOON,
      });
    }
    const beforeRejection = await storedRowCount();

    const rejected = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.99",
      now: NOON,
    });

    expect(rejected.allowed).toBe(false);
    expect(await storedRowCount()).toBe(beforeRejection);
  });

  it("resets the session count once the hourly window rolls over", async () => {
    for (let i = 0; i < 600; i++) {
      await recordBackofficeRequest(db, {
        sessionKeyValue: "session-hash-1",
        sourceAddress: `203.0.113.${i % 250}`,
        now: NOON,
      });
    }
    const withinTheSameHour = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.99",
      now: NOON,
    });
    expect(withinTheSameHour.allowed).toBe(false);

    const nextHour = new Date(NOON.getTime() + 60 * 60 * 1000);
    const afterRollover = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.100",
      now: nextHour,
    });

    expect(afterRollover.allowed).toBe(true);
  });

  it("counts the last 60 minutes, not the current clock hour, so a limit never doubles across the hour", async () => {
    for (let i = 0; i < 600; i++) {
      await recordBackofficeRequest(db, {
        sessionKeyValue: "session-hash-1",
        sourceAddress: `203.0.113.${i % 250}`,
        now: minutesAfterNoon(59),
      });
    }

    const twoMinutesLater = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.200",
      now: minutesAfterNoon(61),
    });

    expect(twoMinutesLater.allowed).toBe(false);
  });

  it("reports the seconds until the session's oldest counted request leaves the window", async () => {
    for (let i = 0; i < 600; i++) {
      await recordBackofficeRequest(db, {
        sessionKeyValue: "session-hash-1",
        sourceAddress: `203.0.113.${i % 250}`,
        now: minutesAfterNoon(i % 50),
      });
    }

    const rejected = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.200",
      now: minutesAfterNoon(50),
    });

    expect(rejected).toEqual({ allowed: false, retryAfterSeconds: expect.any(Number) });
    if (rejected.allowed) {
      throw new Error("test setup: expected the 601st request to be rejected");
    }
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(60 * 60);
  });

  it("admits a request made exactly when the reported wait runs out", async () => {
    for (let i = 0; i < 600; i++) {
      await recordBackofficeRequest(db, {
        sessionKeyValue: "session-hash-1",
        sourceAddress: `203.0.113.${i % 250}`,
        now: minutesAfterNoon(i % 50),
      });
    }
    const rejected = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.200",
      now: minutesAfterNoon(50),
    });
    if (rejected.allowed) {
      throw new Error("test setup: expected the 601st request to be rejected");
    }

    const retried = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.201",
      now: new Date(minutesAfterNoon(50).getTime() + rejected.retryAfterSeconds * 1000),
    });

    expect(retried.allowed).toBe(true);
  });

  it("prunes attempts that already left the window when a later attempt is recorded", async () => {
    await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-1",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    await recordBackofficeRequest(db, {
      sessionKeyValue: "session-hash-2",
      sourceAddress: "203.0.113.20",
      now: minutesAfterNoon(90),
    });

    expect(await storedRowCount()).toBe(2);
  });
});
