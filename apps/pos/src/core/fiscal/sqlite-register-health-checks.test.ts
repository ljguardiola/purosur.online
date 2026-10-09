import { recordRegisterHealthCheck } from "@purosur/domain/fiscal/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteRegisterHealthChecks } from "./sqlite-register-health-checks";
import { SqliteRoundTripSamples } from "./sqlite-round-trip-samples";
import { openFiscalDatabase } from "./test-support/real-time-authorization-database";

let database: LocalDatabase;
let healthChecks: SqliteRegisterHealthChecks;

function checkAt(second: number, roundTripMs: number) {
  return {
    checkedAt: new Date(Date.UTC(2026, 8, 30, 12, 0, second)),
    roundTripMs,
    tokenValid: true,
    arcaReachable: false,
  };
}

beforeEach(() => {
  database = openFiscalDatabase();
  healthChecks = new SqliteRegisterHealthChecks(database);
});

afterEach(() => {
  database.close();
});

describe("the register's health checks", () => {
  it("stores what a check found out and when", async () => {
    await healthChecks.recordHealthCheck(checkAt(5, 120), 12);

    expect(
      database
        .prepare(
          "SELECT checked_at, round_trip_ms, token_valid, arca_reachable FROM register_health_checks",
        )
        .all(),
    ).toEqual([
      {
        checked_at: "2026-09-30T12:00:05.000Z",
        round_trip_ms: 120,
        token_valid: 1,
        arca_reachable: 0,
      },
    ]);
  });

  it("keeps only the latest ones it is asked to", async () => {
    for (let second = 1; second <= 14; second += 1) {
      await healthChecks.recordHealthCheck(checkAt(second, second * 10), 12);
    }

    expect(
      database.prepare("SELECT round_trip_ms FROM register_health_checks ORDER BY id").all(),
    ).toEqual(Array.from({ length: 12 }, (_, index) => ({ round_trip_ms: (index + 3) * 10 })));
  });

  it("keeps the last 12 when the use case records them", async () => {
    for (let second = 1; second <= 14; second += 1) {
      await recordRegisterHealthCheck({ healthChecks }, checkAt(second, second));
    }

    expect(database.prepare("SELECT count(*) AS total FROM register_health_checks").get()).toEqual({
      total: 12,
    });
  });
});

describe("the round trips of the latest health checks", () => {
  it("are none before any check", async () => {
    await expect(new SqliteRoundTripSamples(database).recent()).resolves.toEqual([]);
  });

  it("are the round trips kept, oldest first", async () => {
    await healthChecks.recordHealthCheck(checkAt(1, 300), 12);
    await healthChecks.recordHealthCheck(checkAt(2, 100), 12);
    await healthChecks.recordHealthCheck(checkAt(3, 200), 12);

    await expect(new SqliteRoundTripSamples(database).recent()).resolves.toEqual([300, 100, 200]);
  });
});
