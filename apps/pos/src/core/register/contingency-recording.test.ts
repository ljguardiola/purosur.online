import type { FiscalEmissionMode } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createContingencyRecording } from "./contingency-recording";
import { applyReplenishedContingencyFact } from "./replenished-contingency-facts";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const OFFLINE: FiscalEmissionMode = { kind: "offline_code", cause: "no_connectivity" };
const REAL_TIME: FiscalEmissionMode = { kind: "real_time" };

let database: LocalDatabase;
let mode: FiscalEmissionMode;
let moment: Date;
let chainKey: string | undefined;
let failures: unknown[];
let nextId: number;
let modeUnreadable: boolean;

function recording() {
  return createContingencyRecording({
    database,
    now: () => moment,
    ids: {
      next: () => {
        nextId += 1;
        return `id-${nextId}`;
      },
    },
    readMode: () => {
      if (modeUnreadable) {
        throw new Error("the mode cannot be read");
      }
      return mode;
    },
    readOutboxChainKey: async () => chainKey,
    reportFailure: (error) => failures.push(error),
  });
}

function openSession(): void {
  database
    .prepare(
      `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-12T11:00:00.000Z', 0, 'OPEN')`,
    )
    .run();
}

function eventTypes(): string[] {
  return database
    .prepare<[], { event_type: string }>("SELECT event_type FROM outbox ORDER BY device_seq")
    .all()
    .map((row) => row.event_type);
}

function intervals() {
  return database
    .prepare("SELECT interval_id, started_at, ended_at, last_seen_at FROM contingency_intervals")
    .all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database
    .prepare(
      "INSERT INTO own_register (id, name, version, removed) VALUES ('register-1', 'Caja 1', 1, 0)",
    )
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1' WHERE id = 1").run();
  mode = REAL_TIME;
  moment = new Date("2026-10-12T12:00:00.000Z");
  chainKey = CHAIN_KEY;
  failures = [];
  nextId = 0;
  modeUnreadable = false;
});

afterEach(() => {
  database.close();
});

describe("createContingencyRecording", () => {
  it("records nothing before the register can write to its outbox", async () => {
    chainKey = undefined;
    mode = OFFLINE;
    openSession();

    await recording().check();

    expect(eventTypes()).toEqual([]);
    expect(intervals()).toEqual([]);
    expect(failures).toEqual([]);
  });

  it("reports that it started recording contingency once, at the first check after enrollment", async () => {
    chainKey = undefined;
    const contingency = recording();
    await contingency.check();
    chainKey = CHAIN_KEY;

    await contingency.check();
    await contingency.check();

    expect(eventTypes()).toEqual(["contingency_reporting_started"]);
  });

  it("opens one interval for a register that goes offline and is checked again and again", async () => {
    openSession();
    mode = OFFLINE;
    const contingency = recording();

    await Promise.all([contingency.check(), contingency.check(), contingency.check()]);

    expect(eventTypes()).toEqual(["contingency_reporting_started", "contingency_entered"]);
    expect(intervals()).toHaveLength(1);
  });

  it("closes the interval when the register is back online", async () => {
    openSession();
    mode = OFFLINE;
    const contingency = recording();
    await contingency.check();
    mode = REAL_TIME;
    moment = new Date("2026-10-12T12:30:00.000Z");

    await contingency.check();

    expect(eventTypes()).toEqual([
      "contingency_reporting_started",
      "contingency_entered",
      "contingency_left",
    ]);
    expect(intervals()).toEqual([
      expect.objectContaining({ ended_at: "2026-10-12T12:30:00.000Z" }),
    ]);
  });

  it("on startup, ends an interval left open at its last moment seen and evaluates the mode again", async () => {
    openSession();
    mode = OFFLINE;
    await recording().check();
    moment = new Date("2026-10-12T12:20:00.000Z");
    await recording().check();
    moment = new Date("2026-10-12T18:00:00.000Z");

    await recording().startup();

    expect(intervals()).toEqual([
      expect.objectContaining({
        interval_id: "id-2",
        ended_at: "2026-10-12T12:20:00.000Z",
      }),
      expect.objectContaining({
        started_at: "2026-10-12T18:00:00.000Z",
        ended_at: null,
      }),
    ]);
    expect(eventTypes()).toEqual([
      "contingency_reporting_started",
      "contingency_entered",
      "contingency_left",
      "contingency_entered",
    ]);
  });

  it("ends, at the next check, an interval the replaced register left open at the last moment it was known running", async () => {
    openSession();
    mode = OFFLINE;
    const contingency = recording();
    await contingency.startup();
    applyReplenishedContingencyFact(database, {
      kind: "contingency_entered",
      interval: {
        intervalId: "interval-replaced",
        startedAt: new Date("2026-10-12T10:00:00.000Z"),
      },
    });

    await contingency.check();

    expect(intervals()).toEqual([
      expect.objectContaining({ interval_id: "id-2", ended_at: null }),
      expect.objectContaining({
        interval_id: "interval-replaced",
        ended_at: "2026-10-12T10:00:00.000Z",
      }),
    ]);
    expect(eventTypes()).toEqual([
      "contingency_reporting_started",
      "contingency_entered",
      "contingency_left",
    ]);
  });

  it("reports a failure and keeps checking afterwards", async () => {
    openSession();
    mode = OFFLINE;
    modeUnreadable = true;
    const contingency = recording();

    await contingency.check();
    modeUnreadable = false;
    await contingency.check();

    expect(failures).toEqual([new Error("the mode cannot be read")]);
    expect(eventTypes()).toContain("contingency_entered");
  });
});
