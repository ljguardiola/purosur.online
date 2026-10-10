import { randomUUID } from "node:crypto";
import { applyPendingEvents, type SyncedFact } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pendingTransaction } from "../payments/test-support/payment-transaction-fixtures.js";
import { inbox, paymentTransactions } from "../platform/db/schema.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";
import { unappliedEventOf } from "./test-support/unapplied-event.js";

const system = eventApplicationUnderTest();

function replacementFact(paymentTransactionId: string, saleId: string): SyncedFact {
  return { kind: "qr_payment_replaced", replacement: { paymentTransactionId, saleId } };
}

async function record(fact: SyncedFact, saleId: string, deviceId: string) {
  const event = unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 1,
      aggregate_type: "Sale",
      aggregate_id: saleId,
      event_type: "qr_payment_replaced",
      schema_version: 1,
      payload: {},
      occurred_at: "2026-10-06T11:30:00.000Z",
      actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      chain_hmac: "hmac",
    },
    { deviceId },
  );
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function replacedOf(id: string) {
  const [row] = await system.db
    .select({ replaced: paymentTransactions.replaced, state: paymentTransactions.state })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.id, id));
  return row;
}

describe("recording the replacement of a pending QR payment", () => {
  it("marks the register's pending payment transaction as replaced and leaves its state", async () => {
    const { deviceId, registerId } = await system.enrollInstallation();
    const transaction = pendingTransaction(registerId);
    await system.db.insert(paymentTransactions).values(transaction);

    await record(replacementFact(transaction.id, transaction.saleId), transaction.saleId, deviceId);

    expect(await replacedOf(transaction.id)).toEqual({ replaced: true, state: "PENDING" });
  });

  it("marks a payment transaction that already closed too, as the register sold it replaced", async () => {
    const { deviceId, registerId } = await system.enrollInstallation();
    const transaction = pendingTransaction(registerId, { state: "APPROVED" });
    await system.db.insert(paymentTransactions).values(transaction);

    await record(replacementFact(transaction.id, transaction.saleId), transaction.saleId, deviceId);

    expect(await replacedOf(transaction.id)).toEqual({ replaced: true, state: "APPROVED" });
  });

  it("does not mark the transaction of another register and refuses the event", async () => {
    const { deviceId } = await system.enrollInstallation();
    const other = await system.enrollInstallation();
    const transaction = pendingTransaction(other.registerId);
    await system.db.insert(paymentTransactions).values(transaction);

    await expect(
      record(replacementFact(transaction.id, transaction.saleId), transaction.saleId, deviceId),
    ).rejects.toThrow(`payment transaction ${transaction.id} is not recorded for register`);

    expect(await replacedOf(transaction.id)).toMatchObject({ replaced: false });
  });

  it("refuses an event naming a payment transaction nobody recorded", async () => {
    const { deviceId } = await system.enrollInstallation();
    const id = randomUUID();

    await expect(record(replacementFact(id, randomUUID()), randomUUID(), deviceId)).rejects.toThrow(
      `payment transaction ${id} is not recorded for register`,
    );
  });

  it("does not mark a payment transaction of another sale", async () => {
    const { deviceId, registerId } = await system.enrollInstallation();
    const transaction = pendingTransaction(registerId);
    await system.db.insert(paymentTransactions).values(transaction);

    await expect(
      record(replacementFact(transaction.id, randomUUID()), transaction.saleId, deviceId),
    ).rejects.toThrow("is not recorded for register");

    expect(await replacedOf(transaction.id)).toMatchObject({ replaced: false });
  });

  it("applies a pushed replacement event end to end", async () => {
    const { deviceId, registerId } = await system.enrollInstallation();
    const transaction = pendingTransaction(registerId);
    await system.db.insert(paymentTransactions).values(transaction);
    const eventId = await insertInboxEvent(system.db, deviceId, {
      aggregateId: transaction.saleId,
      eventType: "qr_payment_replaced",
      schemaVersion: 1,
      payload: { payment_transaction_id: transaction.id, sale_id: transaction.saleId },
    });

    const outcome = await applyPendingEvents(
      {
        eventApplication: system.application,
        upcaster: syncedEventUpcaster,
        clock: { now: () => new Date("2026-10-06T15:00:00.000Z") },
      },
      { limit: 10 },
    );

    expect(outcome).toMatchObject({ kind: "processed", applied: 1, retried: 0 });
    expect(await replacedOf(transaction.id)).toMatchObject({ replaced: true });
    const [event] = await system.db.select().from(inbox).where(eq(inbox.eventId, eventId));
    expect(event?.appliedAt).not.toBeNull();
  });
});
