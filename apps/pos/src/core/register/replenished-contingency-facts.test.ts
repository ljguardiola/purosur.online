import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { applyReplenishedContingencyFact } from "./replenished-contingency-facts";

const STARTED = new Date("2026-10-06T11:00:00.000Z");
const ENDED = new Date("2026-10-06T11:40:00.000Z");

const entered: Extract<SyncedFact, { kind: "contingency_entered" }> = {
  kind: "contingency_entered",
  interval: { intervalId: "interval-1", startedAt: STARTED },
};
const left: Extract<SyncedFact, { kind: "contingency_left" }> = {
  kind: "contingency_left",
  interval: { intervalId: "interval-1", startedAt: STARTED, endedAt: ENDED },
};
const reportingStarted: Extract<SyncedFact, { kind: "contingency_reporting_started" }> = {
  kind: "contingency_reporting_started",
  reporting: { since: STARTED },
};

let database: LocalDatabase;

function intervals() {
  return database
    .prepare("SELECT interval_id, started_at, ended_at, last_seen_at FROM contingency_intervals")
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

describe("applyReplenishedContingencyFact", () => {
  it("holds an interval the cloud knew as open, last seen when it started", () => {
    applyReplenishedContingencyFact(database, entered);

    expect(intervals()).toEqual([
      {
        interval_id: "interval-1",
        started_at: STARTED.toISOString(),
        ended_at: null,
        last_seen_at: STARTED.toISOString(),
      },
    ]);
  });

  it("keeps the row of an interval it already holds", () => {
    database
      .prepare(
        `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at)
         VALUES ('interval-1', ?, NULL, '2026-10-06T11:30:00.000Z')`,
      )
      .run(STARTED.toISOString());

    applyReplenishedContingencyFact(database, entered);

    expect(intervals()).toEqual([
      expect.objectContaining({ ended_at: null, last_seen_at: "2026-10-06T11:30:00.000Z" }),
    ]);
  });

  it("ends the interval it holds", () => {
    applyReplenishedContingencyFact(database, entered);

    applyReplenishedContingencyFact(database, left);

    expect(intervals()).toEqual([
      expect.objectContaining({
        ended_at: ENDED.toISOString(),
        last_seen_at: STARTED.toISOString(),
      }),
    ]);
  });

  it("holds an interval that ended without the cloud's entry being applied first, closed", () => {
    applyReplenishedContingencyFact(database, left);

    expect(intervals()).toEqual([
      {
        interval_id: "interval-1",
        started_at: STARTED.toISOString(),
        ended_at: ENDED.toISOString(),
        last_seen_at: ENDED.toISOString(),
      },
    ]);
  });

  it("applies an entry and an exit again without changing the interval", () => {
    for (const fact of [entered, left, entered, left]) {
      applyReplenishedContingencyFact(database, fact);
    }

    expect(intervals()).toEqual([
      expect.objectContaining({
        ended_at: ENDED.toISOString(),
        last_seen_at: STARTED.toISOString(),
      }),
    ]);
  });

  it("holds the moment the register started reporting contingency", () => {
    applyReplenishedContingencyFact(database, reportingStarted);

    expect(database.prepare("SELECT id, since FROM contingency_reporting_start").all()).toEqual([
      { id: 1, since: STARTED.toISOString() },
    ]);
  });

  it("keeps the moment it already holds", () => {
    database
      .prepare(
        "INSERT INTO contingency_reporting_start (id, since) VALUES (1, '2026-10-01T00:00:00.000Z')",
      )
      .run();

    applyReplenishedContingencyFact(database, reportingStarted);

    expect(database.prepare("SELECT since FROM contingency_reporting_start").all()).toEqual([
      { since: "2026-10-01T00:00:00.000Z" },
    ]);
  });
});
