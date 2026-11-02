import { describe, expect, it } from "vitest";
import type { FiscalEmissionMode } from "../../fiscal/index.js";
import { DEFERRAL_REASONS, OFFLINE_AUTHORIZATION_CAUSES } from "../../fiscal/index.js";
import { recordContingencyChange } from "./record-contingency-change.js";
import { SequentialIds } from "./test-support/fake-cash-ledger.js";
import {
  FakeContingencyLedger,
  type FakeContingencyLedgerState,
  type FakeContingencyLedgerWrite,
} from "./test-support/fake-contingency-ledger.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-10-02T15:00:00.000Z");
const STARTED = new Date("2026-10-02T12:00:00.000Z");
const SEEN = new Date("2026-10-02T14:00:00.000Z");
const OFFLINE: FiscalEmissionMode = { kind: "offline_code", cause: "no_connectivity" };
const REAL_TIME: FiscalEmissionMode = { kind: "real_time" };

const OPEN_INTERVAL = {
  id: "interval-1",
  startedAt: STARTED,
  lastSeenAt: SEEN,
  endedAt: null,
};

function record(mode: FiscalEmissionMode, state: Partial<FakeContingencyLedgerState> = {}) {
  const ledger = new FakeContingencyLedger(state);
  const outcome = recordContingencyChange(
    { ledger, clock: new FixedClock(NOW), ids: new SequentialIds() },
    { mode },
  );
  return { ledger, outcome };
}

describe("recordContingencyChange", () => {
  it("opens an interval, started now, when the register goes fiscally offline with a session open", () => {
    const { ledger, outcome } = record(OFFLINE);

    expect(outcome).toEqual({ kind: "entered", intervalId: "id-1" });
    expect(ledger.state.intervals).toEqual([
      { id: "id-1", startedAt: NOW, lastSeenAt: NOW, endedAt: null },
    ]);
    expect(ledger.state.outbox).toEqual([
      {
        event_id: "id-2",
        aggregate_type: "Register",
        aggregate_id: "register-1",
        event_type: "contingency_entered",
        schema_version: 1,
        payload: { interval_id: "id-1", started_at: NOW.toISOString() },
        occurred_at: NOW.toISOString(),
        actor_id: "register-1",
      },
    ]);
  });

  it("closes the open interval, ended now, when the register is back online", () => {
    const { ledger, outcome } = record(REAL_TIME, { intervals: [OPEN_INTERVAL] });

    expect(outcome).toEqual({ kind: "left", intervalId: "interval-1" });
    expect(ledger.state.intervals).toEqual([{ ...OPEN_INTERVAL, endedAt: NOW }]);
    expect(ledger.state.outbox).toEqual([
      {
        event_id: "id-1",
        aggregate_type: "Register",
        aggregate_id: "register-1",
        event_type: "contingency_left",
        schema_version: 1,
        payload: {
          interval_id: "interval-1",
          started_at: STARTED.toISOString(),
          ended_at: NOW.toISOString(),
        },
        occurred_at: NOW.toISOString(),
        actor_id: "register-1",
      },
    ]);
  });

  it("only refreshes the last moment seen while the register stays offline", () => {
    const { ledger, outcome } = record(OFFLINE, { intervals: [OPEN_INTERVAL] });

    expect(outcome).toEqual({ kind: "refreshed", intervalId: "interval-1" });
    expect(ledger.state.intervals).toEqual([{ ...OPEN_INTERVAL, lastSeenAt: NOW }]);
    expect(ledger.state.outbox).toEqual([]);
  });

  it("keeps the last moment seen when the clock was set back while the register stays offline", () => {
    const seenLater = { ...OPEN_INTERVAL, lastSeenAt: new Date("2026-10-02T16:00:00.000Z") };
    const { ledger, outcome } = record(OFFLINE, { intervals: [seenLater] });

    expect(outcome).toEqual({ kind: "refreshed", intervalId: "interval-1" });
    expect(ledger.state.intervals).toEqual([seenLater]);
  });

  it("ends the interval at its start when the clock was set back before it started", () => {
    const LATER = new Date("2026-10-02T16:00:00.000Z");
    const startedLater = { ...OPEN_INTERVAL, startedAt: LATER, lastSeenAt: LATER };
    const { ledger, outcome } = record(REAL_TIME, { intervals: [startedLater] });

    expect(outcome).toEqual({ kind: "left", intervalId: "interval-1" });
    expect(ledger.state.intervals).toEqual([{ ...startedLater, endedAt: LATER }]);
    expect(ledger.state.outbox).toEqual([
      expect.objectContaining({
        payload: {
          interval_id: "interval-1",
          started_at: LATER.toISOString(),
          ended_at: LATER.toISOString(),
        },
      }),
    ]);
  });

  it("emits one event when the register is checked again and again while offline", () => {
    const ledger = new FakeContingencyLedger();
    const ports = { ledger, clock: new FixedClock(NOW), ids: new SequentialIds() };

    recordContingencyChange(ports, { mode: OFFLINE });
    recordContingencyChange(ports, { mode: OFFLINE });
    recordContingencyChange(ports, { mode: OFFLINE });

    expect(ledger.state.outbox.map((event) => event.event_type)).toEqual(["contingency_entered"]);
    expect(ledger.state.intervals).toHaveLength(1);
  });

  it("ends the interval when the cash session closes while the register is still offline", () => {
    const { ledger, outcome } = record(OFFLINE, {
      intervals: [OPEN_INTERVAL],
      cashSessionOpen: false,
    });

    expect(outcome).toEqual({ kind: "left", intervalId: "interval-1" });
    expect(ledger.state.intervals[0]?.endedAt).toEqual(NOW);
  });

  it("starts no interval while the register is offline without a cash session", () => {
    const { ledger, outcome } = record(OFFLINE, { cashSessionOpen: false });

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(ledger.state.intervals).toEqual([]);
    expect(ledger.state.outbox).toEqual([]);
  });

  it("does nothing while the register is online and no interval is open", () => {
    const { ledger, outcome } = record(REAL_TIME);

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(ledger.state.outbox).toEqual([]);
  });

  it("starts a new interval after a closed one", () => {
    const closed = { ...OPEN_INTERVAL, endedAt: SEEN };
    const { ledger, outcome } = record(OFFLINE, { intervals: [closed] });

    expect(outcome).toEqual({ kind: "entered", intervalId: "id-1" });
    expect(ledger.state.intervals).toHaveLength(2);
  });

  it.each(OFFLINE_AUTHORIZATION_CAUSES.filter((cause) => cause !== "no_connectivity"))(
    "never opens an interval while issuing offline because of %s",
    (cause) => {
      const { ledger, outcome } = record({ kind: "offline_code", cause });

      expect(outcome).toEqual({ kind: "unchanged" });
      expect(ledger.state.intervals).toEqual([]);
    },
  );

  it.each(DEFERRAL_REASONS)("never opens an interval while deferring for %s", (reason) => {
    const { ledger, outcome } = record({ kind: "deferring", reason });

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(ledger.state.intervals).toEqual([]);
  });

  it("closes the open interval when the register starts deferring", () => {
    const { outcome } = record(
      { kind: "deferring", reason: "fiscally_offline" },
      { intervals: [OPEN_INTERVAL] },
    );

    expect(outcome).toEqual({ kind: "left", intervalId: "interval-1" });
  });

  it("changes nothing when the register has no identity yet", () => {
    const { ledger, outcome } = record(OFFLINE, { registerId: undefined });

    expect(outcome).toEqual({ kind: "unavailable" });
    expect(ledger.state.intervals).toEqual([]);
  });

  it("runs in one transaction", () => {
    const { ledger } = record(OFFLINE);

    expect(ledger.transactions).toBe(1);
  });

  it.each<FakeContingencyLedgerWrite>(["recordOpenedInterval", "appendOutboxEvent"])(
    "leaves nothing behind when %s fails while opening",
    (write) => {
      const ledger = new FakeContingencyLedger();
      ledger.failOn = write;

      expect(() =>
        recordContingencyChange(
          { ledger, clock: new FixedClock(NOW), ids: new SequentialIds() },
          { mode: OFFLINE },
        ),
      ).toThrow(`${write} failed`);
      expect(ledger.state.intervals).toEqual([]);
      expect(ledger.state.outbox).toEqual([]);
    },
  );

  it("leaves the interval open when the event of closing it fails", () => {
    const ledger = new FakeContingencyLedger({ intervals: [OPEN_INTERVAL] });
    ledger.failOn = "appendOutboxEvent";

    expect(() =>
      recordContingencyChange(
        { ledger, clock: new FixedClock(NOW), ids: new SequentialIds() },
        { mode: REAL_TIME },
      ),
    ).toThrow("appendOutboxEvent failed");
    expect(ledger.state.intervals).toEqual([OPEN_INTERVAL]);
  });
});
