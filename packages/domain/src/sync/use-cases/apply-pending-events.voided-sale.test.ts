import { describe, expect, it } from "vitest";
import { aVoidedSaleFact } from "../model/test-support/synced-facts.js";
import { applyPendingEvents } from "./apply-pending-events.js";
import {
  aStoredEvent,
  FakeEventApplication,
  FakeEventUpcaster,
  FakeQuarantineNotices,
} from "./test-support/fake-event-application.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");

const OPENED_SESSION = aStoredEvent({
  eventId: "opened",
  aggregateType: "CashSession",
  aggregateId: "session-1",
  eventType: "cash_session_opened",
  schemaVersion: 1,
  appliedAt: new Date("2026-10-07T09:00:00.000Z"),
});

const VOID_EVENT = aStoredEvent({
  eventId: "void-event",
  eventType: "sale_voided",
  schemaVersion: 2,
});

type VoidedSale = ReturnType<typeof aVoidedSaleFact>;
type Refund = VoidedSale["sale"]["refunds"][number];

const refund = (overrides: Partial<Refund>): Refund => ({
  id: "refund-1",
  paymentId: "payment-1",
  method: "CASH",
  provider: "NONE",
  amount: 1000,
  state: "APPROVED",
  occurredAt: new Date("2026-10-07T10:05:00.000Z"),
  ...overrides,
});

const CASH = refund({});
const TRANSFER = refund({ id: "refund-2", method: "TRANSFER", state: "PENDING" });
const QR = refund({
  id: "refund-3",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  state: "PENDING",
});
const POINT = refund({
  id: "refund-4",
  method: "POINT",
  provider: "MERCADOPAGO_POINT",
  state: "PENDING",
});

function apply(application: FakeEventApplication, refunds: Refund[]) {
  return applyPendingEvents(
    {
      eventApplication: application,
      upcaster: new FakeEventUpcaster({ "void-event": aVoidedSaleFact({ refunds }) }),
      clock: { now: () => NOW },
      quarantineNotices: new FakeQuarantineNotices(),
    },
    { limit: 100 },
  );
}

describe("applying a voided sale with Mercado Pago refunds", () => {
  it.each([
    ["QR", QR],
    ["POINT", POINT],
  ])(
    "asks for the refunds to be followed at once when a %s refund is recorded",
    async (_method, mercadoPago) => {
      const application = new FakeEventApplication([OPENED_SESSION, VOID_EVENT]);

      await apply(application, [CASH, mercadoPago]);

      expect(application.state.refundFollowRequests).toHaveLength(1);
      expect(application.state.writeOrder).toEqual(["record", "stock return", "refund follow"]);
    },
  );

  it("asks once for a sale with several Mercado Pago refunds", async () => {
    const application = new FakeEventApplication([OPENED_SESSION, VOID_EVENT]);

    await apply(application, [QR, POINT]);

    expect(application.state.refundFollowRequests).toHaveLength(1);
  });

  it("asks for nothing when the voided sale has no Mercado Pago refund", async () => {
    const application = new FakeEventApplication([OPENED_SESSION, VOID_EVENT]);

    await apply(application, [CASH, TRANSFER]);

    expect(application.state.refundFollowRequests).toEqual([]);
  });

  it("asks for nothing when the voiding is not applied", async () => {
    const application = new FakeEventApplication([OPENED_SESSION, VOID_EVENT]);
    application.refuseStock.set("void-event", "product product-1 is not in the catalog");

    await apply(application, [QR]);

    expect(application.state.refundFollowRequests).toEqual([]);
  });

  it("asks only once when the voiding is applied again", async () => {
    const application = new FakeEventApplication([OPENED_SESSION, VOID_EVENT]);

    await apply(application, [QR]);
    await apply(application, [QR]);

    expect(application.state.refundFollowRequests).toHaveLength(1);
  });
});
