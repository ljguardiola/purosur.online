import { describe, expect, it } from "vitest";
import { startContingencyReporting } from "./start-contingency-reporting.js";
import { SequentialIds } from "./test-support/fake-cash-ledger.js";
import {
  FakeContingencyLedger,
  type FakeContingencyLedgerState,
} from "./test-support/fake-contingency-ledger.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-10-02T15:00:00.000Z");

function start(ledger: FakeContingencyLedger) {
  return startContingencyReporting({
    ledger,
    clock: new FixedClock(NOW),
    ids: new SequentialIds(),
  });
}

function ledgerWith(state: Partial<FakeContingencyLedgerState> = {}) {
  return new FakeContingencyLedger(state);
}

describe("startContingencyReporting", () => {
  it("remembers and reports the moment the register starts recording contingency", () => {
    const ledger = ledgerWith();

    expect(start(ledger)).toEqual({ kind: "started", since: NOW });
    expect(ledger.state.reportingStartedAt).toEqual(NOW);
    expect(ledger.state.outbox).toEqual([
      {
        event_id: "id-1",
        aggregate_type: "Register",
        aggregate_id: "register-1",
        event_type: "contingency_reporting_started",
        schema_version: 1,
        payload: { since: NOW.toISOString() },
        occurred_at: NOW.toISOString(),
        actor_id: "register-1",
      },
    ]);
  });

  it("reports it only once", () => {
    const ledger = ledgerWith();

    start(ledger);
    const second = start(ledger);

    expect(second).toEqual({ kind: "already_started" });
    expect(ledger.state.outbox).toHaveLength(1);
  });

  it("does not report again when it had started before", () => {
    const earlier = new Date("2026-09-01T00:00:00.000Z");
    const ledger = ledgerWith({ reportingStartedAt: earlier });

    expect(start(ledger)).toEqual({ kind: "already_started" });
    expect(ledger.state.reportingStartedAt).toEqual(earlier);
    expect(ledger.state.outbox).toEqual([]);
  });

  it("starts nothing when the register has no identity yet", () => {
    const ledger = ledgerWith({ registerId: undefined });

    expect(start(ledger)).toEqual({ kind: "unavailable" });
    expect(ledger.state.reportingStartedAt).toBeUndefined();
    expect(ledger.state.outbox).toEqual([]);
  });

  it("remembers nothing when the event cannot be appended", () => {
    const ledger = ledgerWith();
    ledger.failOn = "appendOutboxEvent";

    expect(() => start(ledger)).toThrow("appendOutboxEvent failed");
    expect(ledger.state.reportingStartedAt).toBeUndefined();
  });
});
