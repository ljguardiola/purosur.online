import { aCompletedSaleFact } from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import {
  applyReplenishedContingencyFact,
  recordReplenishedRunningEvidence,
} from "./replenished-contingency-facts";

const STARTED = new Date("2026-10-06T11:00:00.000Z");
const ENDED = new Date("2026-10-06T11:40:00.000Z");
const SOURCE = { eventId: "event-1", deviceId: "device-old", occurredAt: STARTED };

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
  reporting: { since: STARTED, fromEnrollment: false },
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
    applyReplenishedContingencyFact(database, entered, SOURCE);

    expect(intervals()).toEqual([
      {
        interval_id: "interval-1",
        started_at: STARTED.toISOString(),
        ended_at: null,
        last_seen_at: STARTED.toISOString(),
      },
    ]);
  });

  it("holds an interval the replaced register left open as that register's, beside this register's own open one", () => {
    database
      .prepare(
        `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at)
         VALUES ('interval-own', '2026-10-06T12:00:00.000Z', NULL, '2026-10-06T12:00:00.000Z')`,
      )
      .run();

    applyReplenishedContingencyFact(database, entered, SOURCE);

    expect(
      database
        .prepare(
          "SELECT interval_id, ended_at, predecessor FROM contingency_intervals ORDER BY interval_id",
        )
        .all(),
    ).toEqual([
      { interval_id: "interval-1", ended_at: null, predecessor: 1 },
      { interval_id: "interval-own", ended_at: null, predecessor: 0 },
    ]);
  });

  it("keeps the row of an interval it already holds", () => {
    database
      .prepare(
        `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at)
         VALUES ('interval-1', ?, NULL, '2026-10-06T11:30:00.000Z')`,
      )
      .run(STARTED.toISOString());

    applyReplenishedContingencyFact(database, entered, SOURCE);

    expect(intervals()).toEqual([
      expect.objectContaining({ ended_at: null, last_seen_at: "2026-10-06T11:30:00.000Z" }),
    ]);
  });

  it("ends the interval it holds", () => {
    applyReplenishedContingencyFact(database, entered, SOURCE);

    applyReplenishedContingencyFact(database, left, SOURCE);

    expect(intervals()).toEqual([
      expect.objectContaining({
        ended_at: ENDED.toISOString(),
        last_seen_at: STARTED.toISOString(),
      }),
    ]);
  });

  it("holds an interval that ended without the cloud's entry being applied first, closed", () => {
    applyReplenishedContingencyFact(database, left, SOURCE);

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
      applyReplenishedContingencyFact(database, fact, SOURCE);
    }

    expect(intervals()).toEqual([
      expect.objectContaining({
        ended_at: ENDED.toISOString(),
        last_seen_at: STARTED.toISOString(),
      }),
    ]);
  });

  it("holds the moment the register started reporting contingency", () => {
    applyReplenishedContingencyFact(database, reportingStarted, SOURCE);

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

    applyReplenishedContingencyFact(database, reportingStarted, SOURCE);

    expect(database.prepare("SELECT since FROM contingency_reporting_start").all()).toEqual([
      { since: "2026-10-01T00:00:00.000Z" },
    ]);
  });
});

describe("recordReplenishedRunningEvidence", () => {
  const A_SALE = aCompletedSaleFact();

  function sessionClosed(closedAt: Date): SyncedFact {
    return {
      kind: "cash_session_closed",
      session: {
        id: "session-1",
        closedBy: "user-2",
        closedAt,
        expectedCash: 7000,
        countedCash: 7000,
        difference: 0,
      },
    };
  }

  function seen(fact: SyncedFact, occurredAt: string, deviceId = "device-old"): void {
    recordReplenishedRunningEvidence(database, fact, {
      eventId: `event-${occurredAt}`,
      deviceId,
      occurredAt: new Date(occurredAt),
    });
  }

  function evidence() {
    return database
      .prepare(
        "SELECT interval_id, last_seen_at, session_closed_at FROM contingency_intervals ORDER BY interval_id",
      )
      .all();
  }

  it("moves the last moment a replaced register's open interval was seen to each later fact of that register, never back", () => {
    applyReplenishedContingencyFact(database, entered, SOURCE);

    seen(A_SALE, "2026-10-06T11:30:00.000Z");
    seen(A_SALE, "2026-10-06T11:20:00.000Z");

    expect(evidence()).toEqual([
      {
        interval_id: "interval-1",
        last_seen_at: "2026-10-06T11:30:00.000Z",
        session_closed_at: null,
      },
    ]);
  });

  it("leaves an interval as it was on another installation's facts", () => {
    applyReplenishedContingencyFact(database, entered, SOURCE);

    seen(A_SALE, "2026-10-06T11:30:00.000Z", "device-other");

    expect(evidence()).toEqual([expect.objectContaining({ last_seen_at: STARTED.toISOString() })]);
  });

  it("leaves an interval that ended and the register's own open interval as they were", () => {
    applyReplenishedContingencyFact(database, entered, SOURCE);
    applyReplenishedContingencyFact(database, left, SOURCE);
    database
      .prepare(
        `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at)
         VALUES ('interval-own', ?, NULL, ?)`,
      )
      .run(STARTED.toISOString(), STARTED.toISOString());

    seen(sessionClosed(new Date("2026-10-06T11:50:00.000Z")), "2026-10-06T11:50:00.000Z");

    expect(evidence()).toEqual([
      {
        interval_id: "interval-1",
        last_seen_at: STARTED.toISOString(),
        session_closed_at: null,
      },
      {
        interval_id: "interval-own",
        last_seen_at: STARTED.toISOString(),
        session_closed_at: null,
      },
    ]);
  });

  it("holds the first moment the replaced register closed its cash session after the interval started", () => {
    applyReplenishedContingencyFact(database, entered, SOURCE);

    seen(sessionClosed(new Date("2026-10-06T10:30:00.000Z")), "2026-10-06T10:30:00.000Z");
    seen(sessionClosed(new Date("2026-10-06T11:50:00.000Z")), "2026-10-06T11:50:00.000Z");
    seen(sessionClosed(new Date("2026-10-06T11:45:00.000Z")), "2026-10-06T11:45:00.000Z");
    seen(A_SALE, "2026-10-06T13:00:00.000Z");

    expect(evidence()).toEqual([
      {
        interval_id: "interval-1",
        last_seen_at: "2026-10-06T13:00:00.000Z",
        session_closed_at: "2026-10-06T11:45:00.000Z",
      },
    ]);
  });

  it("holds the session close at the interval's own start", () => {
    applyReplenishedContingencyFact(database, entered, SOURCE);

    seen(sessionClosed(STARTED), STARTED.toISOString());

    expect(evidence()).toEqual([
      expect.objectContaining({ session_closed_at: STARTED.toISOString() }),
    ]);
  });
});
