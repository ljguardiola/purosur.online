import {
  BACKOFFICE_REQUEST_WINDOW_MS,
  BACKOFFICE_SESSION_REQUEST_LIMIT,
  BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT,
} from "@purosur/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
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

async function seedAdmittedRequests(
  keyKind: "session" | "source_address",
  keyValue: string,
  count: number,
  attemptedAt: (n: number) => Date = () => NOON,
): Promise<void> {
  const times = Array.from({ length: count }, (_, n) => attemptedAt(n).toISOString());
  await client.query(
    `insert into backoffice_rate_limit_attempts (key_kind, key_value, attempted_at)
     select $1, $2, attempted_at from unnest($3::timestamptz[]) as attempted_at`,
    [keyKind, keyValue, times],
  );
}

describe("recordBackofficeRequest", () => {
  it("allows the first request for a fresh session and source address", async () => {
    const result = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(result.allowed).toBe(true);
  });

  it("records an admitted request once against its session and once against its source address", async () => {
    await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(await storedRowCount()).toBe(2);
  });

  it("allows the session's limit of requests in the window, then rejects the next one", async () => {
    await seedAdmittedRequests("session", "session-1", BACKOFFICE_SESSION_REQUEST_LIMIT - 1);
    const attempt = (sourceAddress: string) =>
      recordBackofficeRequest(db, { sessionKeyValue: "session-1", sourceAddress, now: NOON });

    expect((await attempt("203.0.113.10")).allowed).toBe(true);
    expect((await attempt("203.0.113.11")).allowed).toBe(false);
  });

  it("allows the source address's limit of requests in the window, then rejects the next one", async () => {
    await seedAdmittedRequests(
      "source_address",
      "203.0.113.10",
      BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT - 1,
    );
    const attempt = (sessionKeyValue: string) =>
      recordBackofficeRequest(db, { sessionKeyValue, sourceAddress: "203.0.113.10", now: NOON });

    expect((await attempt("session-at-the-limit")).allowed).toBe(true);
    expect((await attempt("session-one-too-many")).allowed).toBe(false);
  });

  it("does not let one session's count affect another", async () => {
    await seedAdmittedRequests("session", "session-1", BACKOFFICE_SESSION_REQUEST_LIMIT);

    const result = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-2",
      sourceAddress: "203.0.113.250",
      now: NOON,
    });

    expect(result.allowed).toBe(true);
  });

  it("applies the source-address limit across sessions, rejecting a fresh session from the same address", async () => {
    await seedAdmittedRequests(
      "source_address",
      "203.0.113.10",
      BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT,
    );

    const result = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-fresh",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    expect(result.allowed).toBe(false);
  });

  it("records nothing for a rejected request", async () => {
    await seedAdmittedRequests("session", "session-1", BACKOFFICE_SESSION_REQUEST_LIMIT);
    const beforeRejection = await storedRowCount();

    const rejected = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.99",
      now: NOON,
    });

    expect(rejected.allowed).toBe(false);
    expect(await storedRowCount()).toBe(beforeRejection);
  });

  it("resets the session count once the window rolls over", async () => {
    await seedAdmittedRequests("session", "session-1", BACKOFFICE_SESSION_REQUEST_LIMIT);
    const withinTheSameHour = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.99",
      now: NOON,
    });
    expect(withinTheSameHour.allowed).toBe(false);

    const nextWindow = new Date(NOON.getTime() + BACKOFFICE_REQUEST_WINDOW_MS);
    const afterRollover = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.100",
      now: nextWindow,
    });

    expect(afterRollover.allowed).toBe(true);
  });

  it("counts a sliding window, not the current clock hour, so a limit never doubles across the hour", async () => {
    await seedAdmittedRequests("session", "session-1", BACKOFFICE_SESSION_REQUEST_LIMIT, () =>
      minutesAfterNoon(59),
    );

    const twoMinutesLater = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.200",
      now: minutesAfterNoon(61),
    });

    expect(twoMinutesLater.allowed).toBe(false);
  });

  it("reports the seconds until the session's oldest counted request leaves the window", async () => {
    await seedAdmittedRequests("session", "session-1", BACKOFFICE_SESSION_REQUEST_LIMIT, (n) =>
      minutesAfterNoon(n % 50),
    );

    const rejected = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.200",
      now: minutesAfterNoon(50),
    });

    expect(rejected).toEqual({
      allowed: false,
      retryAfterSeconds: (BACKOFFICE_REQUEST_WINDOW_MS - 50 * MINUTE_MS) / 1000,
    });
  });

  it("admits a request made exactly when the reported wait runs out", async () => {
    await seedAdmittedRequests("session", "session-1", BACKOFFICE_SESSION_REQUEST_LIMIT, (n) =>
      minutesAfterNoon(n % 50),
    );
    const rejected = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.200",
      now: minutesAfterNoon(50),
    });
    if (rejected.allowed) {
      throw new Error("test setup: expected the request over the limit to be rejected");
    }

    const retried = await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.201",
      now: new Date(minutesAfterNoon(50).getTime() + rejected.retryAfterSeconds * 1000),
    });

    expect(retried.allowed).toBe(true);
  });

  it("prunes attempts that already left the window when a later attempt is recorded", async () => {
    await recordBackofficeRequest(db, {
      sessionKeyValue: "session-1",
      sourceAddress: "203.0.113.10",
      now: NOON,
    });

    await recordBackofficeRequest(db, {
      sessionKeyValue: "session-2",
      sourceAddress: "203.0.113.20",
      now: new Date(NOON.getTime() + BACKOFFICE_REQUEST_WINDOW_MS + 30 * MINUTE_MS),
    });

    expect(await storedRowCount()).toBe(2);
  });
});
