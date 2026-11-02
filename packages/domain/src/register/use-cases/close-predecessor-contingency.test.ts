import { describe, expect, it } from "vitest";
import { closePredecessorContingency } from "./close-predecessor-contingency.js";
import { SequentialIds } from "./test-support/fake-cash-ledger.js";
import {
  FakeContingencyLedger,
  type FakeContingencyLedgerState,
} from "./test-support/fake-contingency-ledger.js";

const STARTED = new Date("2026-10-02T12:00:00.000Z");
const SEEN = new Date("2026-10-02T14:00:00.000Z");
const PREDECESSOR_INTERVAL = {
  id: "interval-1",
  startedAt: STARTED,
  lastSeenAt: SEEN,
  endedAt: null,
  predecessor: true,
};

function close(state: Partial<FakeContingencyLedgerState>) {
  const ledger = new FakeContingencyLedger(state);
  const outcome = closePredecessorContingency({ ledger, ids: new SequentialIds() });
  return { ledger, outcome };
}

describe("closePredecessorContingency", () => {
  it("ends an interval the replaced register left open at the last moment it was known to be running", () => {
    const { ledger, outcome } = close({ intervals: [PREDECESSOR_INTERVAL] });

    expect(outcome).toEqual({ kind: "closed", intervalIds: ["interval-1"] });
    expect(ledger.state.intervals).toEqual([{ ...PREDECESSOR_INTERVAL, endedAt: SEEN }]);
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

  it("ends every interval the replaced registers left open, each with its own event", () => {
    const another = { ...PREDECESSOR_INTERVAL, id: "interval-2" };
    const { ledger, outcome } = close({ intervals: [PREDECESSOR_INTERVAL, another] });

    expect(outcome).toEqual({ kind: "closed", intervalIds: ["interval-1", "interval-2"] });
    expect(ledger.state.outbox.map((event) => [event.event_id, event.payload])).toEqual([
      ["id-1", expect.objectContaining({ interval_id: "interval-1" })],
      ["id-2", expect.objectContaining({ interval_id: "interval-2" })],
    ]);
  });

  it("ends an interval last seen before it started at its start", () => {
    const seenEarlier = {
      ...PREDECESSOR_INTERVAL,
      lastSeenAt: new Date("2026-10-02T11:00:00.000Z"),
    };
    const { ledger } = close({ intervals: [seenEarlier] });

    expect(ledger.state.intervals).toEqual([{ ...seenEarlier, endedAt: STARTED }]);
    expect(ledger.state.outbox).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ ended_at: STARTED.toISOString() }),
      }),
    ]);
  });

  it("leaves the register's own open interval running", () => {
    const own = { ...PREDECESSOR_INTERVAL, id: "interval-own", predecessor: false };
    const { ledger, outcome } = close({ intervals: [own] });

    expect(outcome).toEqual({ kind: "closed", intervalIds: [] });
    expect(ledger.state.intervals).toEqual([own]);
    expect(ledger.state.outbox).toEqual([]);
  });

  it("changes nothing when the register has no identity yet", () => {
    const { ledger, outcome } = close({
      intervals: [PREDECESSOR_INTERVAL],
      registerId: undefined,
    });

    expect(outcome).toEqual({ kind: "unavailable" });
    expect(ledger.state.intervals).toEqual([PREDECESSOR_INTERVAL]);
  });

  it("runs in one transaction", () => {
    const { ledger } = close({ intervals: [PREDECESSOR_INTERVAL] });

    expect(ledger.transactions).toBe(1);
  });

  it("leaves every interval open when the event of closing one fails", () => {
    const ledger = new FakeContingencyLedger({ intervals: [PREDECESSOR_INTERVAL] });
    ledger.failOn = "appendOutboxEvent";

    expect(() => closePredecessorContingency({ ledger, ids: new SequentialIds() })).toThrow(
      "appendOutboxEvent failed",
    );
    expect(ledger.state.intervals).toEqual([PREDECESSOR_INTERVAL]);
  });
});
