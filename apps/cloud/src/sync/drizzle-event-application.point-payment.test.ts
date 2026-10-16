import { randomUUID } from "node:crypto";
import { applyPendingEvents } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import { pendingPointTransaction } from "../payments/test-support/payment-transaction-fixtures.js";
import { paymentRefunds, paymentTransactions } from "../platform/db/schema.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { pushMercadoPagoSaleCancelled } from "./test-support/mercado-pago-cancelled-sale-push.js";

const system = eventApplicationUnderTest();

const AMOUNT = 30_700;

function applyPending() {
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

describe("applying a pushed cancellation of a sale paid on the Point terminal", () => {
  it("applies the cancellation, leaving its refund pending, unconfirmed, on the provider's transaction", async () => {
    const { deviceId, locationId, registerId } = await system.enrollInstallation();
    const saleId = randomUUID();
    const backing = pendingPointTransaction(registerId, {
      id: randomUUID(),
      saleId,
      amount: AMOUNT,
      state: "APPROVED",
    });
    await system.db.insert(paymentTransactions).values(backing);
    const eventId = await pushMercadoPagoSaleCancelled(system.db, {
      deviceId,
      locationId,
      saleId,
      paymentId: backing.id,
      amount: AMOUNT,
      method: "POINT",
    });

    const outcome = await applyPending();

    expect(outcome).toMatchObject({ kind: "processed", applied: 2, retried: 0 });
    const [refund] = await system.db.select().from(paymentRefunds);
    expect(refund).toMatchObject({
      saleId,
      paymentId: backing.id,
      paymentTransactionId: backing.id,
      originEventId: eventId,
      origin: "sale_cancelled",
      method: "POINT",
      provider: "MERCADOPAGO_POINT",
      amount: AMOUNT,
      state: "PENDING",
      confirmedBy: null,
      confirmedAt: null,
      sentAt: null,
    });
    expect(system.refundFollowRequests).toBe(0);
  });
});
