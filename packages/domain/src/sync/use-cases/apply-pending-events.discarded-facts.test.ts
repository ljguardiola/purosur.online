import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { SyncedFact } from "../model/synced-fact.js";
import { aCancelledSaleFact, aRemovedSaleLineFact } from "../model/test-support/synced-facts.js";
import { applyPendingEvents } from "./apply-pending-events.js";
import {
  aStoredEvent,
  FakeEventApplication,
  FakeEventUpcaster,
  FakeQuarantineNotices,
} from "./test-support/fake-event-application.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");

const factEvent = (eventType: string, schemaVersion: number) =>
  aStoredEvent({ eventId: "event", eventType, schemaVersion });

function apply(application: FakeEventApplication, fact: SyncedFact) {
  return applyPendingEvents(
    {
      zoneRules: new FakeZoneRulesSource(),
      eventApplication: application,
      upcaster: new FakeEventUpcaster({ event: fact }),
      clock: { now: () => NOW },
      quarantineNotices: new FakeQuarantineNotices(),
    },
    { limit: 100 },
  );
}

const declinedQrPayment = {
  id: "payment-1",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  amount: 1500,
  tendered: null,
  state: "DECLINED",
  occurredAt: new Date("2026-10-07T10:00:00.000Z"),
  cardType: null,
  authorizedBy: null,
  confirmedAt: null,
} as const;

describe("applying a removed sale line", () => {
  it("is applied and stores nothing, without waiting for its cash session", async () => {
    const application = new FakeEventApplication([factEvent("sale_line_removed", 1)]);

    const outcome = await apply(application, aRemovedSaleLineFact());

    expect(outcome).toMatchObject({ kind: "processed", applied: 1, flagged: 0, quarantined: 0 });
    expect(application.event("event")).toMatchObject({ appliedAt: NOW, attempts: 0 });
    expect(application.state.recorded).toEqual([]);
  });
});

describe("applying a cancelled sale that took no approved payment", () => {
  it.each([
    ["no payment at all", []],
    ["only a declined payment", [declinedQrPayment]],
  ])(
    "is applied and stores nothing, without waiting for its cash session, with %s",
    async (_case, payments) => {
      const application = new FakeEventApplication([factEvent("sale_cancelled", 10)]);

      const outcome = await apply(application, aCancelledSaleFact({ payments, refunds: [] }));

      expect(outcome).toMatchObject({ kind: "processed", applied: 1, flagged: 0, quarantined: 0 });
      expect(application.event("event")).toMatchObject({ appliedAt: NOW, attempts: 0 });
      expect(application.state.recorded).toEqual([]);
      expect(application.calls.filter((call) => call.startsWith("read provider"))).toEqual([]);
    },
  );

  it("records no invariant break for refunds that match no approved payment", async () => {
    const application = new FakeEventApplication([factEvent("sale_cancelled", 10)]);

    const outcome = await apply(
      application,
      aCancelledSaleFact({
        payments: [declinedQrPayment],
        refunds: aCancelledSaleFact().sale.refunds,
      }),
    );

    expect(outcome).toMatchObject({ kind: "processed", applied: 1, flagged: 0 });
    expect(application.state.invariantBreaks).toEqual([]);
  });
});

describe("applying a cancelled sale that took an approved payment", () => {
  it("is still recorded once the cash session it was made in is applied", async () => {
    const application = new FakeEventApplication([
      aStoredEvent({
        eventId: "opened",
        aggregateType: "CashSession",
        aggregateId: "session-1",
        eventType: "cash_session_opened",
        schemaVersion: 1,
        appliedAt: new Date("2026-10-07T09:00:00.000Z"),
      }),
      factEvent("sale_cancelled", 10),
    ]);
    const cancellation = aCancelledSaleFact();

    await apply(application, cancellation);

    expect(application.state.recorded).toEqual([{ fact: cancellation, eventId: "event" }]);
  });

  it("still waits for the cash session it was made in", async () => {
    const application = new FakeEventApplication([factEvent("sale_cancelled", 10)]);

    await apply(application, aCancelledSaleFact());

    expect(application.state.recorded).toEqual([]);
    expect(application.event("event")).toMatchObject({ appliedAt: null, attempts: 1 });
  });
});
