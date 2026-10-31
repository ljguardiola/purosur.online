import { randomUUID } from "node:crypto";
import { syncedEventUpcaster } from "@purosur/contracts";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pendingTransaction } from "../payments/test-support/payment-transaction-fixtures.js";
import {
  alerts,
  inbox,
  paymentRefunds,
  paymentTransactions,
  salePayments,
  sales,
} from "../platform/db/schema.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import {
  pushRebuiltSaleCancelled,
  pushRebuiltSaleCompleted,
} from "./test-support/rebuilt-paid-order-push.js";

const system = eventApplicationUnderTest();

const PAID = 3000;

function applyPending() {
  return applyPendingEvents(
    {
      zoneRules: fixedZoneRulesSource(),
      eventApplication: system.application,
      upcaster: syncedEventUpcaster,
      clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
      quarantineNotices: { quarantined: () => {} },
    },
    { limit: 10 },
  );
}

async function aPaidOrder(overrides: Partial<ReturnType<typeof pendingTransaction>> = {}) {
  const { deviceId, locationId, registerId } = await system.enrollInstallation();
  const transaction = pendingTransaction(registerId, {
    id: randomUUID(),
    amount: PAID,
    state: "APPROVED",
    ...overrides,
  });
  await system.db.insert(paymentTransactions).values(transaction);
  return { deviceId, locationId, transaction };
}

describe("applying a pushed sale rebuilt against a paid order", () => {
  it("applies the sale with the order's payment, leaving the order's own sale untouched", async () => {
    const { deviceId, locationId, transaction } = await aPaidOrder();
    const saleId = randomUUID();
    await pushRebuiltSaleCompleted(system.db, {
      deviceId,
      locationId,
      saleId,
      paymentTransactionId: transaction.id,
      applied: 3000,
      surplus: 0,
    });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 2, retried: 0 });
    const [sale] = await system.db.select().from(sales).where(eq(sales.id, saleId));
    expect(sale).toMatchObject({ state: "COMPLETED", total: 3000 });
    const [payment] = await system.db.select().from(salePayments);
    expect(payment).toMatchObject({ id: transaction.id, saleId, method: "QR", amount: 3000 });
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
    const [stored] = await system.db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, transaction.id));
    expect(stored?.saleId).toBe(transaction.saleId);
  });

  it("opens one pending late-payment refund of the surplus on the rebuilt sale, with its alert", async () => {
    const { deviceId, locationId, transaction } = await aPaidOrder();
    const saleId = randomUUID();
    await pushRebuiltSaleCompleted(system.db, {
      deviceId,
      locationId,
      saleId,
      paymentTransactionId: transaction.id,
      applied: 2400,
      surplus: 600,
    });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 2, retried: 0 });
    const [payment] = await system.db.select().from(salePayments);
    expect(payment).toMatchObject({ id: transaction.id, saleId, amount: 2400 });
    const [refund] = await system.db.select().from(paymentRefunds);
    expect(refund).toMatchObject({
      saleId,
      paymentId: null,
      paymentTransactionId: transaction.id,
      origin: "late_payment",
      method: "QR",
      amount: 600,
      state: "PENDING",
    });
    expect(await system.db.select().from(alerts)).toEqual([
      expect.objectContaining({
        kind: "late_payment_refund",
        scope: refund?.id,
        detail: { saleId, amount: 600, providerOrderId: null, method: "QR" },
      }),
    ]);
  });

  it("creates nothing twice when the same sale is delivered again", async () => {
    const { deviceId, locationId, transaction } = await aPaidOrder();
    const saleId = randomUUID();
    const push = {
      deviceId,
      locationId,
      saleId,
      paymentTransactionId: transaction.id,
      applied: 2400,
      surplus: 600,
    };
    await pushRebuiltSaleCompleted(system.db, push);
    await applyPending();
    await pushRebuiltSaleCompleted(system.db, push);

    await applyPending();

    expect(await system.db.select().from(sales)).toHaveLength(1);
    expect(await system.db.select().from(salePayments)).toHaveLength(1);
    expect(await system.db.select().from(paymentRefunds)).toHaveLength(1);
    expect(await system.db.select().from(alerts)).toHaveLength(1);
  });

  it.each([
    ["is not approved", { state: "PENDING" as const }, 2400, 600],
    ["is for more than the sale and its surplus add up to", {}, 2400, 500],
    ["is for less than the sale and its surplus add up to", { amount: 2400 }, 2400, 600],
  ])(
    "applies nothing, and retries the event, when the order %s",
    async (_description, overrides, applied, surplus) => {
      const { deviceId, locationId, transaction } = await aPaidOrder(overrides);
      await pushRebuiltSaleCompleted(system.db, {
        deviceId,
        locationId,
        saleId: randomUUID(),
        paymentTransactionId: transaction.id,
        applied,
        surplus,
      });

      const outcome = await applyPending();

      expect(outcome).toMatchObject({ kind: "processed", retried: 1 });
      expect(await system.db.select().from(sales)).toEqual([]);
      expect(await system.db.select().from(paymentRefunds)).toEqual([]);
    },
  );

  it("refuses the payment of another sale's order when the sale names no paid order of its own", async () => {
    const { deviceId, locationId, transaction } = await aPaidOrder();
    const saleId = randomUUID();
    const eventId = await pushRebuiltSaleCompleted(system.db, {
      deviceId,
      locationId,
      saleId,
      paymentTransactionId: transaction.id,
      applied: PAID,
      surplus: 0,
      schemaVersion: 9,
    });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ retried: 1 });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(event?.appliedAt).toBeNull();
    expect(await system.db.select().from(sales)).toEqual([]);
  });
});

describe("applying a pushed cancellation of a sale rebuilt against a paid order", () => {
  it("applies the cancellation, leaving the refund of the order pending on its transaction", async () => {
    const { deviceId, locationId, transaction } = await aPaidOrder();
    const saleId = randomUUID();
    await pushRebuiltSaleCancelled(system.db, {
      deviceId,
      locationId,
      saleId,
      paymentTransactionId: transaction.id,
      applied: PAID,
      surplus: 0,
    });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 2, retried: 0 });
    const [sale] = await system.db.select().from(sales).where(eq(sales.id, saleId));
    expect(sale).toMatchObject({ state: "CANCELLED" });
    const [refund] = await system.db.select().from(paymentRefunds);
    expect(refund).toMatchObject({
      saleId,
      paymentTransactionId: transaction.id,
      origin: "sale_cancelled",
      amount: PAID,
      state: "PENDING",
    });
  });
});
