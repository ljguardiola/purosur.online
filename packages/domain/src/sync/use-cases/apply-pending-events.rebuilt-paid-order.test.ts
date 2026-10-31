import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { aCompletedSaleFact } from "../model/test-support/synced-facts.js";
import { applyPendingEvents } from "./apply-pending-events.js";
import {
  aStoredEvent,
  FakeEventApplication,
  FakeEventUpcaster,
  FakeQuarantineNotices,
} from "./test-support/fake-event-application.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");

const openedSession = () =>
  aStoredEvent({
    eventId: "opened",
    aggregateType: "CashSession",
    aggregateId: "session-1",
    eventType: "cash_session_opened",
    schemaVersion: 1,
    appliedAt: new Date("2026-10-07T09:00:00.000Z"),
  });

const saleEvent = () => aStoredEvent({ eventId: "sale-event", schemaVersion: 10 });

const qrPayment = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "order-1",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: 1500,
    tendered: null,
    state: "APPROVED",
    occurredAt: new Date("2026-10-07T10:00:00.000Z"),
    cardType: null,
    authorizedBy: null,
    confirmedAt: null,
    ...overrides,
  }) as const;

const PAID_ORDER_TRANSACTION = {
  saleId: "the-orders-own-sale",
  amount: 4500,
  state: "APPROVED",
  method: "QR",
} as const;

function rebuiltSale(surplus: number, payments = [qrPayment()]) {
  return aCompletedSaleFact({
    payments,
    rebuiltPaidOrder: { paymentTransactionId: "order-1", surplus },
  });
}

async function apply(application: FakeEventApplication, fact: ReturnType<typeof rebuiltSale>) {
  await applyPendingEvents(
    {
      zoneRules: new FakeZoneRulesSource(),
      eventApplication: application,
      upcaster: new FakeEventUpcaster({ "sale-event": fact }),
      clock: { now: () => NOW },
      quarantineNotices: new FakeQuarantineNotices(),
    },
    { limit: 100 },
  );
}

function application() {
  return new FakeEventApplication([openedSession(), saleEvent()]);
}

describe("applying a sale rebuilt against a paid order", () => {
  it("is applied when the payment of the order is backed by its approved transaction of any sale, which is the payment plus the surplus", async () => {
    const held = application();
    held.providerTransactions.set("order-1", PAID_ORDER_TRANSACTION);

    await apply(held, rebuiltSale(3000));

    expect(held.event("sale-event").appliedAt).toEqual(NOW);
  });

  it("is applied with no surplus when the payment is the whole amount of the order", async () => {
    const held = application();
    held.providerTransactions.set("order-1", { ...PAID_ORDER_TRANSACTION, amount: 1500 });

    await apply(held, rebuiltSale(0));

    expect(held.event("sale-event").appliedAt).toEqual(NOW);
  });

  it.each([
    ["has no transaction", undefined],
    ["has a pending transaction", { ...PAID_ORDER_TRANSACTION, state: "PENDING" as const }],
    [
      "has a transaction of the other method",
      { ...PAID_ORDER_TRANSACTION, method: "POINT" as const },
    ],
    [
      "has a transaction that is not the payment plus the surplus",
      { ...PAID_ORDER_TRANSACTION, amount: 4400 },
    ],
  ])("is retried and left unrecorded when the order's payment %s", async (_case, transaction) => {
    const held = application();
    if (transaction !== undefined) {
      held.providerTransactions.set("order-1", transaction);
    }

    await apply(held, rebuiltSale(3000));

    expect(held.event("sale-event")).toMatchObject({
      appliedAt: null,
      attempts: 1,
      error:
        "payment order-1 is not backed by an approved Mercado Pago transaction of this sale and amount",
    });
    expect(held.state.recorded).toEqual([]);
    expect(held.state.surplusRefunds).toEqual([]);
  });

  it("holds every other Mercado Pago payment of the sale to its own sale and exact amount", async () => {
    const held = application();
    held.providerTransactions.set("order-1", PAID_ORDER_TRANSACTION);
    held.providerTransactions.set("qr-2", {
      saleId: "another-sale",
      amount: 500,
      state: "APPROVED",
      method: "QR",
    });

    await apply(held, rebuiltSale(3000, [qrPayment(), qrPayment({ id: "qr-2", amount: 500 })]));

    expect(held.event("sale-event").appliedAt).toBeNull();
    expect(held.event("sale-event").error).toBe(
      "payment qr-2 is not backed by an approved Mercado Pago transaction of this sale and amount",
    );
  });

  it("backs another Mercado Pago payment of the sale by its own transaction as usual", async () => {
    const held = application();
    held.providerTransactions.set("order-1", PAID_ORDER_TRANSACTION);
    held.providerTransactions.set("qr-2", {
      saleId: "sale-1",
      amount: 500,
      state: "APPROVED",
      method: "QR",
    });

    await apply(held, rebuiltSale(3000, [qrPayment(), qrPayment({ id: "qr-2", amount: 500 })]));

    expect(held.event("sale-event").appliedAt).toEqual(NOW);
  });

  it("hands the surplus of the paid order to be refunded once, after recording the sale", async () => {
    const held = application();
    held.providerTransactions.set("order-1", PAID_ORDER_TRANSACTION);

    await apply(held, rebuiltSale(3000));

    expect(held.state.surplusRefunds).toEqual([
      { paymentTransactionId: "order-1", amount: 3000, eventId: "sale-event" },
    ]);
    expect(held.state.writeOrder.indexOf("record")).toBeLessThan(
      held.state.writeOrder.indexOf("surplus refund"),
    );
  });

  it("hands no refund over when the paid order left no surplus", async () => {
    const held = application();
    held.providerTransactions.set("order-1", { ...PAID_ORDER_TRANSACTION, amount: 1500 });

    await apply(held, rebuiltSale(0));

    expect(held.state.surplusRefunds).toEqual([]);
  });

  it("hands no refund over for a sale that was not rebuilt against a paid order", async () => {
    const held = application();

    await apply(held, aCompletedSaleFact());

    expect(held.event("sale-event").appliedAt).toEqual(NOW);
    expect(held.state.surplusRefunds).toEqual([]);
  });

  it("holds a payment that merely carries the same id to the strict rule when the sale names no paid order", async () => {
    const held = application();
    held.providerTransactions.set("order-1", PAID_ORDER_TRANSACTION);

    await apply(held, aCompletedSaleFact({ payments: [qrPayment()] }));

    expect(held.event("sale-event").appliedAt).toBeNull();
  });
});
