import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { describe, expect, it } from "vitest";
import {
  cashMovements,
  paymentRefunds,
  removedSaleLines,
  saleLines,
  salePayments,
  sales,
} from "../platform/db/schema.js";
import { eventApplicationUnderTest } from "./test-support/drizzle-event-application.js";
import {
  aCancelledSale,
  aCashSessionOpenedFact,
  aCompletedSale,
  aRemovedSaleLine,
} from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";

async function record(fact: SyncedFact, overrides: Partial<UnappliedEvent>) {
  const event = unappliedEventOf(
    {
      event_id: overrides.eventId ?? randomUUID(),
      device_seq: 1,
      aggregate_type: "Sale",
      aggregate_id: randomUUID(),
      event_type: "sale_completed",
      schema_version: 2,
      payload: {},
      occurred_at: "2026-10-06T11:20:00.000Z",
      actor_id: CASHIER,
      chain_hmac: "hmac",
    },
    overrides,
  );
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function openSession(deviceId: string) {
  const sessionId = randomUUID();
  await record(aCashSessionOpenedFact({ id: sessionId }), { deviceId });
  return sessionId;
}

describe("recording the removed sale lines of applied events", () => {
  it("keeps the line with who removed it, when, and where, under the event that recorded it", async () => {
    const { deviceId, registerId, locationId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const removal = aRemovedSaleLine({ sessionId });
    const eventId = randomUUID();

    await record(
      { kind: "sale_line_removed", removal },
      { eventId, deviceId, aggregateId: removal.saleId },
    );

    expect(await system.db.select().from(removedSaleLines)).toEqual([
      {
        id: removal.line.id,
        saleId: removal.saleId,
        locationId,
        registerId,
        deviceId,
        sessionId,
        actorId: CASHIER,
        productId: removal.line.productId,
        productName: "Azucar",
        quantity: 2,
        weightSource: null,
        lineTotal: 4800,
        removedAt: new Date("2026-10-06T11:18:00.000Z"),
        appliedAt: new Date("2026-10-06T15:00:00.000Z"),
        originEventId: eventId,
      },
    ]);
  });

  it("keeps how a weighed line's weight was taken", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const base = aRemovedSaleLine({ sessionId });
    const removal = { ...base, line: { ...base.line, weightSource: "MANUAL" as const } };

    await record({ kind: "sale_line_removed", removal }, { deviceId });

    const [row] = await system.db.select().from(removedSaleLines);
    expect(row).toMatchObject({ weightSource: "MANUAL" });
  });

  it("keeps one row when the same line is recorded again", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const removal = aRemovedSaleLine({ sessionId });

    await record({ kind: "sale_line_removed", removal }, { deviceId });
    await record({ kind: "sale_line_removed", removal }, { deviceId });

    expect(await system.db.select().from(removedSaleLines)).toHaveLength(1);
  });

  it("keeps the line of a sale that has not arrived, and the sale still arrives later", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const removal = aRemovedSaleLine({ sessionId });

    await record({ kind: "sale_line_removed", removal }, { deviceId });
    const completed = aCompletedSale({ id: removal.saleId, sessionId });
    await record({ kind: "sale_completed", sale: completed }, { deviceId });

    expect((await system.db.select().from(removedSaleLines)).map(({ saleId }) => saleId)).toEqual([
      removal.saleId,
    ]);
    expect((await system.db.select().from(sales)).map(({ id }) => id)).toEqual([removal.saleId]);
  });

  it("keeps the line of a sale that never arrives", async () => {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);

    await record(
      { kind: "sale_line_removed", removal: aRemovedSaleLine({ sessionId }) },
      { deviceId },
    );

    expect(await system.db.select().from(removedSaleLines)).toHaveLength(1);
    expect(await system.db.select().from(sales)).toEqual([]);
  });

  it("refuses the removal in a cash session that was never opened", async () => {
    const { deviceId } = await system.enrollInstallation();

    await expect(
      record({ kind: "sale_line_removed", removal: aRemovedSaleLine() }, { deviceId }),
    ).rejects.toThrow();
  });
});

describe("recording a cancelled sale that took no approved payment", () => {
  async function recordUnpaidCancelled() {
    const { deviceId } = await system.enrollInstallation();
    const sessionId = await openSession(deviceId);
    const cancelled = aCancelledSale({
      sessionId,
      authorizedBy: null,
      payments: [],
      refunds: [],
      cashMovements: [],
    });
    await record({ kind: "sale_cancelled", sale: cancelled }, { deviceId });
    return cancelled;
  }

  it("keeps the sale as cancelled with its lines", async () => {
    const cancelled = await recordUnpaidCancelled();

    const [row] = await system.db.select().from(sales);
    expect(row).toMatchObject({ id: cancelled.id, state: "CANCELLED", total: 4800 });
    expect((await system.db.select().from(saleLines)).map(({ id }) => id)).toEqual(
      cancelled.lines.map(({ id }) => id),
    );
  });

  it("records no payment, refund or cash movement", async () => {
    await recordUnpaidCancelled();

    expect(await system.db.select().from(salePayments)).toEqual([]);
    expect(await system.db.select().from(paymentRefunds)).toEqual([]);
    expect(await system.db.select().from(cashMovements)).toEqual([]);
  });
});
