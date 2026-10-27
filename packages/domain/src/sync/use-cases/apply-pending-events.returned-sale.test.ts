import { describe, expect, it } from "vitest";
import { aReturnedSaleFact } from "../model/test-support/synced-facts.js";
import { applyPendingEvents } from "./apply-pending-events.js";
import {
  aSaleReturnHistory,
  aStoredEvent,
  FakeEventApplication,
  FakeEventUpcaster,
  FakeQuarantineNotices,
} from "./test-support/fake-event-application.js";

const NOW = new Date("2026-10-08T12:00:00.000Z");

const appliedSale = () =>
  aStoredEvent({
    eventId: "sale-event",
    aggregateType: "Sale",
    aggregateId: "sale-1",
    eventType: "sale_completed",
    appliedAt: new Date("2026-10-07T10:00:05.000Z"),
  });

const appliedSession = () =>
  aStoredEvent({
    eventId: "session-event",
    aggregateType: "CashSession",
    aggregateId: "session-2",
    eventType: "cash_session_opened",
    schemaVersion: 1,
    appliedAt: new Date("2026-10-08T09:00:00.000Z"),
  });

const returnEvent = (overrides: Partial<ReturnType<typeof aStoredEvent>> = {}) =>
  aStoredEvent({
    eventId: "return-event",
    aggregateType: "Return",
    aggregateId: "return-1",
    eventType: "sale_returned",
    schemaVersion: 1,
    ...overrides,
  });

function application(...events: ReturnType<typeof aStoredEvent>[]): FakeEventApplication {
  const fake = new FakeEventApplication(events);
  fake.saleReturnHistories.set("sale-1", aSaleReturnHistory());
  return fake;
}

function apply(fake: FakeEventApplication, fact = aReturnedSaleFact()) {
  return applyPendingEvents(
    {
      eventApplication: fake,
      upcaster: new FakeEventUpcaster({ "return-event": fact }),
      clock: { now: () => NOW },
      quarantineNotices: new FakeQuarantineNotices(),
    },
    { limit: 100 },
  );
}

describe("applying a returned sale", () => {
  it("is recorded and then puts the merchandise back in stock", async () => {
    const fake = application(appliedSale(), appliedSession(), returnEvent());

    const outcome = await apply(fake);

    expect(fake.state.recorded.map(({ fact }) => fact.kind)).toEqual(["sale_returned"]);
    expect(fake.state.stockReturnedByCustomers).toEqual([
      { eventId: "return-event", returnId: "return-1" },
    ]);
    expect(fake.event("return-event").appliedAt).toEqual(NOW);
    expect(outcome).toMatchObject({ applied: 1, flagged: 0, quarantined: 0 });
    expect(fake.state.invariantBreaks).toEqual([]);
  });

  it("reads the sale's history before recording the return, so the history does not include it", async () => {
    const fake = application(appliedSale(), appliedSession(), returnEvent());

    await apply(fake);

    expect(fake.state.writeOrder).toEqual(["return history", "record", "return stock"]);
  });

  it("is retried, naming the sale, while the sale it returns against is not applied yet", async () => {
    const fake = application(appliedSession(), returnEvent());

    const outcome = await apply(fake);

    expect(fake.event("return-event")).toMatchObject({
      appliedAt: null,
      attempts: 1,
      error: "depends on Sale sale-1 not applied yet",
    });
    expect(fake.state.recorded).toEqual([]);
    expect(outcome).toMatchObject({ applied: 0, retried: 1 });
  });

  it("is quarantined as a missing dependency on its last allowed attempt", async () => {
    const fake = application(appliedSession(), returnEvent({ attempts: 7 }));

    await apply(fake);

    expect(fake.state.quarantines).toEqual([
      expect.objectContaining({
        eventId: "return-event",
        reason: { kind: "missing_dependency", aggregateType: "Sale", aggregateId: "sale-1" },
      }),
    ]);
  });

  it("is retried while the cash session it refunded in is not applied yet", async () => {
    const fake = application(appliedSale(), returnEvent());

    await apply(fake);

    expect(fake.event("return-event")).toMatchObject({
      appliedAt: null,
      error: "depends on CashSession session-2 not applied yet",
    });
  });

  it("is retried, with the reason, and leaves nothing recorded when its stock is refused", async () => {
    const fake = application(appliedSale(), appliedSession(), returnEvent());
    fake.refuseStock.set("return-event", "product product-1 is not in the catalog");

    await apply(fake);

    expect(fake.event("return-event")).toMatchObject({
      appliedAt: null,
      attempts: 1,
      error: "product product-1 is not in the catalog",
    });
    expect(fake.state.recorded).toEqual([]);
    expect(fake.state.stockReturnedByCustomers).toEqual([]);
  });

  describe("against the history its sale holds", () => {
    const FLAGGED = [
      [
        "refunds more than the payment still had to give back",
        aSaleReturnHistory({
          payments: [{ paymentId: "payment-1", amount: 5000, refundedAmount: 4500 }],
        }),
        ["return_refund_exceeds_payment"],
      ],
      [
        "completes a line outside its window",
        aSaleReturnHistory({ saleOccurredAt: new Date("2026-09-01T10:00:00.000Z") }),
        ["return_line_outside_window"],
      ],
      [
        "returns more than the line had left",
        aSaleReturnHistory({
          lines: [{ saleLineId: "line-1", soldQuantity: 3, returnedQuantity: 3 }],
        }),
        ["return_quantity_exceeds_sale"],
      ],
    ] as const;

    it.each(FLAGGED)(
      "is applied anyway, flagged and never quarantined when it %s",
      async (_description, history, breaks) => {
        const fake = application(appliedSale(), appliedSession(), returnEvent());
        fake.saleReturnHistories.set("sale-1", history);

        const outcome = await apply(fake);

        expect(fake.state.invariantBreaks).toEqual([
          {
            eventId: "return-event",
            eventType: "sale_returned",
            aggregateType: "Return",
            aggregateId: "return-1",
            breaks,
          },
        ]);
        expect(fake.event("return-event").appliedAt).toEqual(NOW);
        expect(fake.state.stockReturnedByCustomers).toHaveLength(1);
        expect(outcome).toMatchObject({ applied: 1, flagged: 1, quarantined: 0 });
      },
    );

    it("is flagged with every break it has", async () => {
      const fake = application(appliedSale(), appliedSession(), returnEvent());
      fake.saleReturnHistories.set(
        "sale-1",
        aSaleReturnHistory({
          saleOccurredAt: new Date("2026-09-01T10:00:00.000Z"),
          lines: [{ saleLineId: "line-1", soldQuantity: 1, returnedQuantity: 1 }],
          payments: [{ paymentId: "payment-1", amount: 1000, refundedAmount: 1000 }],
        }),
      );

      await apply(fake);

      expect(fake.state.invariantBreaks[0]?.breaks).toEqual([
        "return_refund_exceeds_payment",
        "return_line_outside_window",
        "return_quantity_exceeds_sale",
      ]);
    });
  });
});
