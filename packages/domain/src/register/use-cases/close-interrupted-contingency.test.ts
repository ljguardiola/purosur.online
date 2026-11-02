import { describe, expect, it } from "vitest";
import { closeInterruptedContingency } from "./close-interrupted-contingency.js";
import { SequentialIds } from "./test-support/fake-cash-ledger.js";
import {
  FakeContingencyLedger,
  type FakeContingencyLedgerState,
} from "./test-support/fake-contingency-ledger.js";

const STARTED = new Date("2026-10-02T12:00:00.000Z");
const SEEN = new Date("2026-10-02T14:00:00.000Z");
const OPEN_INTERVAL = { id: "interval-1", startedAt: STARTED, lastSeenAt: SEEN, endedAt: null };

function close(state: Partial<FakeContingencyLedgerState>) {
  const ledger = new FakeContingencyLedger(state);
  const outcome = closeInterruptedContingency({ ledger, ids: new SequentialIds() });
  return { ledger, outcome };
}

describe("closeInterruptedContingency", () => {
  it("ends an interval left open at the last moment the register was known to be running", () => {
    const { ledger, outcome } = close({ intervals: [OPEN_INTERVAL] });

    expect(outcome).toEqual({ kind: "closed", intervalId: "interval-1" });
    expect(ledger.state.intervals).toEqual([{ ...OPEN_INTERVAL, endedAt: SEEN }]);
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
          ended_at: SEEN.toISOString(),
        },
        occurred_at: SEEN.toISOString(),
        actor_id: "register-1",
      },
    ]);
  });

  it("ends an interval last seen before it started at its start", () => {
    const seenEarlier = { ...OPEN_INTERVAL, lastSeenAt: new Date("2026-10-02T11:00:00.000Z") };
    const { ledger } = close({ intervals: [seenEarlier] });

    expect(ledger.state.intervals).toEqual([{ ...seenEarlier, endedAt: STARTED }]);
    expect(ledger.state.outbox).toEqual([
      expect.objectContaining({
        payload: {
          interval_id: "interval-1",
          started_at: STARTED.toISOString(),
          ended_at: STARTED.toISOString(),
        },
      }),
    ]);
  });

  it("does nothing when no interval was left open", () => {
    const { ledger, outcome } = close({ intervals: [{ ...OPEN_INTERVAL, endedAt: SEEN }] });

    expect(outcome).toEqual({ kind: "none_open" });
    expect(ledger.state.outbox).toEqual([]);
  });

  it("changes nothing when the register has no identity yet", () => {
    const { ledger, outcome } = close({ intervals: [OPEN_INTERVAL], registerId: undefined });

    expect(outcome).toEqual({ kind: "unavailable" });
    expect(ledger.state.intervals).toEqual([OPEN_INTERVAL]);
  });

  it("runs in one transaction", () => {
    const { ledger } = close({ intervals: [OPEN_INTERVAL] });

    expect(ledger.transactions).toBe(1);
  });
});
