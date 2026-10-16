import { randomUUID } from "node:crypto";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  pendingPointTransaction,
  pendingTransaction,
} from "../payments/test-support/payment-transaction-fixtures.js";
import { paymentRefunds, paymentTransactions, sales } from "../platform/db/schema.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import {
  AMOUNT,
  CASHIER,
  type PaymentMethodOfPush,
  pushSaleThenItsVoiding,
  SUPERVISOR,
  VOIDED_AT,
} from "./test-support/voided-sale-push.js";

const system = eventApplicationUnderTest();

function applyEverything() {
  return applyPendingEvents(
    {
      eventApplication: system.application,
      upcaster: syncedEventUpcaster,
      clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
      quarantineNotices: { quarantined: () => {} },
    },
    { limit: 10 },
  );
}

async function pushVoidedSale(method: PaymentMethodOfPush, authorizedBy?: string) {
  const { deviceId, locationId, registerId } = await system.enrollInstallation();
  const saleId = randomUUID();
  const paymentId = randomUUID();
  if (method === "QR" || method === "POINT") {
    const backing = { id: paymentId, saleId, amount: AMOUNT, state: "APPROVED" } as const;
    await system.db
      .insert(paymentTransactions)
      .values(
        method === "QR"
          ? pendingTransaction(registerId, backing)
          : pendingPointTransaction(registerId, backing),
      );
  }
  await pushSaleThenItsVoiding(system.db, {
    deviceId,
    locationId,
    saleId,
    paymentId,
    method,
    ...(authorizedBy === undefined ? {} : { authorizedBy }),
  });
  return { saleId, paymentId };
}

describe("applying a pushed voiding of a sale paid by Mercado Pago", () => {
  it.each([
    ["QR", "MERCADOPAGO_QR"],
    ["POINT", "MERCADOPAGO_POINT"],
  ] as const)(
    "voids the sale and records the %s refund pending, confirmed by the cashier who voided it",
    async (method, provider) => {
      const { saleId, paymentId } = await pushVoidedSale(method);

      const outcome = await applyEverything();

      expect(outcome).toMatchObject({ kind: "processed", applied: 3, retried: 0 });
      const [sale] = await system.db.select().from(sales).where(eq(sales.id, saleId));
      expect(sale).toMatchObject({ state: "VOIDED", total: AMOUNT });
      expect(await system.db.select().from(paymentRefunds)).toEqual([
        expect.objectContaining({
          saleId,
          paymentId,
          paymentTransactionId: paymentId,
          origin: "sale_voided",
          method,
          provider,
          amount: AMOUNT,
          state: "PENDING",
          confirmedBy: CASHIER,
          confirmedAt: new Date(VOIDED_AT),
        }),
      ]);
    },
  );

  it("records the refund as confirmed by the person who authorized the voiding", async () => {
    await pushVoidedSale("QR", SUPERVISOR);

    await applyEverything();

    expect(await system.db.select().from(paymentRefunds)).toEqual([
      expect.objectContaining({ confirmedBy: SUPERVISOR, confirmedAt: new Date(VOIDED_AT) }),
    ]);
  });

  it("asks for the refunds to be followed at once, once", async () => {
    await pushVoidedSale("QR");

    await applyEverything();
    await applyEverything();

    expect(system.refundFollowRequests).toBe(1);
  });

  it("records the refund of a payment that is not Mercado Pago without a confirmation or a payment transaction, and asks for no follow", async () => {
    await pushVoidedSale("TRANSFER");

    await applyEverything();

    expect(await system.db.select().from(paymentRefunds)).toEqual([
      expect.objectContaining({
        method: "TRANSFER",
        paymentTransactionId: null,
        confirmedBy: null,
        confirmedAt: null,
      }),
    ]);
    expect(system.refundFollowRequests).toBe(0);
  });
});
