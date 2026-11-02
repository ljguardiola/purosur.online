import {
  closeInterruptedContingency,
  closePredecessorContingency,
  type IdGenerator,
  recordContingencyChange,
  recordRegisterSeenUnenrolled,
  startContingencyReporting,
} from "@purosur/domain/register/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteContingencyLedger } from "./sqlite-contingency-ledger";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const OFFLINE = { kind: "offline_code", cause: "no_connectivity" } as const;
const REAL_TIME = { kind: "real_time" } as const;
const T1 = new Date("2026-10-12T12:00:00.000Z");
const T2 = new Date("2026-10-12T12:30:00.000Z");
const T3 = new Date("2026-10-12T13:00:00.000Z");

let database: LocalDatabase;

function ids(): IdGenerator {
  let count = 0;
  return {
    next: () => {
      count += 1;
      return `id-${count}`;
    },
  };
}

function ledger(chainKey: string | undefined = CHAIN_KEY): SqliteContingencyLedger {
  return new SqliteContingencyLedger(database, chainKey);
}

function change(mode: typeof OFFLINE | typeof REAL_TIME, at: Date, chainKey?: string) {
  return recordContingencyChange(
    { ledger: ledger(chainKey), clock: { now: () => at }, ids: ids() },
    { mode },
  );
}

function openSession(): void {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-12T11:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
}

function closeSession(): void {
  database
    .prepare("UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-10-12T12:10:00.000Z'")
    .run();
}

function intervals() {
  return database
    .prepare("SELECT interval_id, started_at, ended_at, last_seen_at FROM contingency_intervals")
    .all();
}

function eventTypes() {
  return database
    .prepare("SELECT event_type FROM outbox ORDER BY device_seq")
    .all()
    .map((row) => (row as { event_type: string }).event_type);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database
    .prepare(
      "INSERT INTO own_register (id, name, version, removed) VALUES ('register-1', 'Caja 1', 1, 0)",
    )
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1' WHERE id = 1").run();
});

afterEach(() => {
  database.close();
});

describe("SqliteContingencyLedger", () => {
  it("records an interval and its event while the register is offline with a cash session open", () => {
    openSession();

    expect(change(OFFLINE, T1)).toEqual({ kind: "entered", intervalId: "id-1" });

    expect(intervals()).toEqual([
      {
        interval_id: "id-1",
        started_at: T1.toISOString(),
        ended_at: null,
        last_seen_at: T1.toISOString(),
      },
    ]);
    expect(eventTypes()).toEqual(["contingency_entered"]);
  });

  it("refreshes the last moment seen without another event", () => {
    openSession();
    change(OFFLINE, T1);

    expect(change(OFFLINE, T2)).toEqual({ kind: "refreshed", intervalId: "id-1" });

    expect(intervals()).toEqual([
      expect.objectContaining({ ended_at: null, last_seen_at: T2.toISOString() }),
    ]);
    expect(eventTypes()).toEqual(["contingency_entered"]);
  });

  it("closes the interval when the cash session closes", () => {
    openSession();
    change(OFFLINE, T1);
    closeSession();

    expect(change(OFFLINE, T2)).toEqual({ kind: "left", intervalId: "id-1" });

    expect(intervals()).toEqual([expect.objectContaining({ ended_at: T2.toISOString() })]);
    expect(eventTypes()).toEqual(["contingency_entered", "contingency_left"]);
  });

  it("opens no interval without a cash session", () => {
    expect(change(OFFLINE, T1)).toEqual({ kind: "unchanged" });

    expect(intervals()).toEqual([]);
  });

  it("closes an interval left open at the last moment seen when the register starts again", () => {
    openSession();
    change(OFFLINE, T1);
    change(OFFLINE, T2);

    const outcome = closeInterruptedContingency({ ledger: ledger(), ids: ids() });

    expect(outcome).toEqual({ kind: "closed", intervalId: "id-1" });
    expect(intervals()).toEqual([expect.objectContaining({ ended_at: T2.toISOString() })]);
    expect(eventTypes()).toEqual(["contingency_entered", "contingency_left"]);
  });

  it("closes an interval the replaced register left open, leaving the register's own one running", () => {
    openSession();
    change(OFFLINE, T1);
    database
      .prepare(
        `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at, predecessor)
         VALUES ('interval-replaced', '2026-10-12T11:00:00.000Z', NULL, '2026-10-12T11:10:00.000Z', 1)`,
      )
      .run();

    const outcome = closePredecessorContingency({ ledger: ledger(), ids: ids() });

    expect(outcome).toEqual({ kind: "closed", intervalIds: ["interval-replaced"] });
    expect(intervals()).toEqual([
      expect.objectContaining({ interval_id: "id-1", ended_at: null }),
      expect.objectContaining({
        interval_id: "interval-replaced",
        ended_at: "2026-10-12T11:10:00.000Z",
      }),
    ]);
    expect(eventTypes()).toEqual(["contingency_entered", "contingency_left"]);
    expect(change(OFFLINE, T2)).toEqual({ kind: "refreshed", intervalId: "id-1" });
  });

  it("ends an interval the replaced register left open when that register closed its cash session", () => {
    database
      .prepare(
        `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at, predecessor, session_closed_at)
         VALUES ('interval-replaced', '2026-10-12T11:00:00.000Z', NULL, '2026-10-12T11:40:00.000Z', 1, '2026-10-12T11:20:00.000Z')`,
      )
      .run();

    closePredecessorContingency({ ledger: ledger(), ids: ids() });

    expect(intervals()).toEqual([
      expect.objectContaining({
        interval_id: "interval-replaced",
        ended_at: "2026-10-12T11:20:00.000Z",
      }),
    ]);
  });

  it("leaves an interval the replaced register left open while its events are still being replenished", () => {
    database
      .prepare(
        `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at, predecessor)
         VALUES ('interval-replaced', '2026-10-12T11:00:00.000Z', NULL, '2026-10-12T11:10:00.000Z', 1)`,
      )
      .run();
    database
      .prepare(
        "INSERT INTO register_predecessor (device_id, last_acknowledged_seq) VALUES ('device-old', 4)",
      )
      .run();

    const outcome = closePredecessorContingency({ ledger: ledger(), ids: ids() });

    expect(outcome).toEqual({ kind: "awaiting_replenishment" });
    expect(intervals()).toEqual([expect.objectContaining({ ended_at: null })]);
    expect(eventTypes()).toEqual([]);
  });

  it("starts reporting once", () => {
    const ports = { ledger: ledger(), clock: { now: () => T3 }, ids: ids() };

    expect(startContingencyReporting(ports)).toEqual({ kind: "started", since: T3 });
    expect(startContingencyReporting(ports)).toEqual({ kind: "already_started" });

    expect(database.prepare("SELECT id, since FROM contingency_reporting_start").all()).toEqual([
      { id: 1, since: T3.toISOString() },
    ]);
    expect(eventTypes()).toEqual(["contingency_reporting_started"]);
  });

  it("starts reporting from enrollment only when the register was seen before it was enrolled", () => {
    const start = () =>
      startContingencyReporting({ ledger: ledger(), clock: { now: () => T3 }, ids: ids() });
    const startedFromEnrollment = () =>
      database
        .prepare<[], { from_enrollment: number }>(
          "SELECT json_extract(payload, '$.from_enrollment') AS from_enrollment FROM outbox",
        )
        .all();

    start();
    expect(startedFromEnrollment()).toEqual([{ from_enrollment: 0 }]);

    database.prepare("DELETE FROM outbox").run();
    database.prepare("DELETE FROM contingency_reporting_start").run();
    recordRegisterSeenUnenrolled({ ledger: ledger(undefined) });
    start();
    expect(startedFromEnrollment()).toEqual([{ from_enrollment: 1 }]);
  });

  it("remembers once that the register was seen before it was enrolled, with no outbox chain key", () => {
    expect(recordRegisterSeenUnenrolled({ ledger: ledger(undefined) })).toEqual({
      kind: "recorded",
    });
    expect(recordRegisterSeenUnenrolled({ ledger: ledger(undefined) })).toEqual({
      kind: "already_recorded",
    });

    expect(database.prepare("SELECT id FROM register_seen_unenrolled").all()).toEqual([{ id: 1 }]);
  });

  it("keeps the order of the events in the register's outbox chain", () => {
    openSession();
    change(OFFLINE, T1);
    change(REAL_TIME, T2);

    expect(database.prepare("SELECT device_seq FROM outbox ORDER BY device_seq").all()).toEqual([
      { device_seq: 1 },
      { device_seq: 2 },
    ]);
  });

  it("leaves nothing behind when the event cannot be appended for lack of a chain key", () => {
    openSession();
    const withoutKey = { ledger: new SqliteContingencyLedger(database, undefined) };

    expect(() =>
      recordContingencyChange(
        { ...withoutKey, clock: { now: () => T1 }, ids: ids() },
        { mode: OFFLINE },
      ),
    ).toThrow("the ledger has no outbox chain key");
    expect(intervals()).toEqual([]);
  });

  it("has no identity before the register is enrolled", () => {
    database.prepare("UPDATE sync_state SET device_id = NULL").run();
    openSession();

    expect(change(OFFLINE, T1)).toEqual({ kind: "unavailable" });
  });
});
