import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  aDeferredSaleRecordedFact,
  aDeferredSaleSatisfiedFactOf,
  insertDeferredSaleRow,
  insertDeferredSaleTaskRow,
} from "../fiscal/test-support/deferred-sale-fixtures.js";
import { deferredSales, fiscalTasks } from "../platform/db/schema.js";
import {
  APPLICATION_NOW,
  eventApplicationUnderTest,
} from "./test-support/drizzle-event-application.js";
import {
  aCashSessionOpenedFact,
  aCompletedSale,
  aVoidedSaleOf,
} from "./test-support/synced-facts.js";

const system = eventApplicationUnderTest();

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const SATISFIED_AT = new Date("2026-10-05T12:00:00.000Z");
const EXPIRED_AT = new Date("2026-10-10T03:00:00.000Z");

function eventOf(deviceId: string, eventType: string, aggregateId: string): UnappliedEvent {
  return unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 1,
      aggregate_type: eventType.startsWith("cash_session") ? "CashSession" : "Sale",
      aggregate_id: aggregateId,
      event_type: eventType,
      schema_version: 1,
      payload: {},
      occurred_at: "2026-10-01T15:00:00.000Z",
      actor_id: CASHIER,
      chain_hmac: "hmac",
    },
    { deviceId },
  );
}

async function record(fact: SyncedFact, event: UnappliedEvent) {
  await system.application.transaction((tx) => tx.record(fact, event));
}

async function anExpiredDeferredSaleWithItsTask(
  installation: { registerId: string; locationId: string },
  overrides: Partial<typeof deferredSales.$inferInsert> = {},
) {
  const sale = await insertDeferredSaleRow(system.db, {
    ...installation,
    state: "expired",
    expiredAt: EXPIRED_AT,
    ...overrides,
  });
  const taskId = await insertDeferredSaleTaskRow(system.db, {
    registerId: installation.registerId,
    deferredSaleId: sale.id,
  });
  return { sale, taskId };
}

describe("recording the deferred sales of applied events", () => {
  it("keeps a recorded deferred sale pending, in the register and location that pushed it", async () => {
    const { deviceId, registerId, locationId } = await system.enrollInstallation();
    const fact = aDeferredSaleRecordedFact();

    await record(fact, eventOf(deviceId, "deferred_sale_recorded", fact.deferredSale.saleId));

    const [row] = await system.db.select().from(deferredSales);
    expect(row).toEqual({
      id: fact.deferredSale.id,
      saleId: fact.deferredSale.saleId,
      registerId,
      locationId,
      occurredAt: fact.deferredSale.occurredAt,
      total: 4800,
      reason: "pre_emission_gate_failed",
      shortCode: "7KQ4M2P9",
      routedAt: fact.deferredSale.routedAt,
      state: "pending",
      satisfiedAt: null,
      cancelledAt: null,
      expiredAt: null,
    });
  });

  it("keeps a deferred sale once when its event is applied again", async () => {
    const { deviceId } = await system.enrollInstallation();
    const fact = aDeferredSaleRecordedFact();
    const event = eventOf(deviceId, "deferred_sale_recorded", fact.deferredSale.saleId);

    await record(fact, event);
    await record(fact, event);

    expect(await system.db.select().from(deferredSales)).toHaveLength(1);
  });

  it("satisfies a pending deferred sale at the time its document was issued", async () => {
    const installation = await system.enrollInstallation();
    const sale = await insertDeferredSaleRow(system.db, installation);

    await record(
      aDeferredSaleSatisfiedFactOf(sale.id, SATISFIED_AT),
      eventOf(installation.deviceId, "deferred_sale_satisfied", sale.saleId),
    );

    const [row] = await system.db.select().from(deferredSales);
    expect(row).toMatchObject({ state: "satisfied", satisfiedAt: SATISFIED_AT, expiredAt: null });
  });

  it("satisfies an expired deferred sale and closes its regularization task", async () => {
    const installation = await system.enrollInstallation();
    const { sale, taskId } = await anExpiredDeferredSaleWithItsTask(installation);

    await record(
      aDeferredSaleSatisfiedFactOf(sale.id, SATISFIED_AT),
      eventOf(installation.deviceId, "deferred_sale_satisfied", sale.saleId),
    );

    const [row] = await system.db.select().from(deferredSales);
    expect(row).toMatchObject({ state: "satisfied", satisfiedAt: SATISFIED_AT });
    const [task] = await system.db.select().from(fiscalTasks).where(eq(fiscalTasks.id, taskId));
    expect(task).toMatchObject({ state: "closed", closedAt: APPLICATION_NOW });
  });

  it("changes nothing when a deferred sale it does not hold is satisfied", async () => {
    const installation = await system.enrollInstallation();

    await record(
      aDeferredSaleSatisfiedFactOf(randomUUID(), SATISFIED_AT),
      eventOf(installation.deviceId, "deferred_sale_satisfied", randomUUID()),
    );

    expect(await system.db.select().from(deferredSales)).toEqual([]);
  });

  describe("when the sale is voided", () => {
    async function voidedSale(
      installation: { deviceId: string },
      { deferredRecordCancelled }: { deferredRecordCancelled: boolean },
    ) {
      const sessionId = randomUUID();
      await record(
        aCashSessionOpenedFact({ id: sessionId }),
        eventOf(installation.deviceId, "cash_session_opened", sessionId),
      );
      const completed = aCompletedSale({ sessionId });
      await record(
        { kind: "sale_completed", sale: completed },
        eventOf(installation.deviceId, "sale_completed", completed.id),
      );
      return {
        completed,
        voided: aVoidedSaleOf(completed, { deferredRecordCancelled }),
      };
    }

    it("cancels the pending deferred sale of that sale", async () => {
      const installation = await system.enrollInstallation();
      const { completed, voided } = await voidedSale(installation, {
        deferredRecordCancelled: true,
      });
      await insertDeferredSaleRow(system.db, { ...installation, saleId: completed.id });

      await record(
        { kind: "sale_voided", creditNote: null, sale: voided },
        eventOf(installation.deviceId, "sale_voided", completed.id),
      );

      const [row] = await system.db.select().from(deferredSales);
      expect(row).toMatchObject({ state: "cancelled", cancelledAt: voided.voidedAt });
    });

    it("cancels the expired deferred sale of that sale and closes its regularization task", async () => {
      const installation = await system.enrollInstallation();
      const { completed, voided } = await voidedSale(installation, {
        deferredRecordCancelled: true,
      });
      const { taskId } = await anExpiredDeferredSaleWithItsTask(installation, {
        saleId: completed.id,
      });

      await record(
        { kind: "sale_voided", creditNote: null, sale: voided },
        eventOf(installation.deviceId, "sale_voided", completed.id),
      );

      const [row] = await system.db.select().from(deferredSales);
      expect(row).toMatchObject({ state: "cancelled" });
      const [task] = await system.db.select().from(fiscalTasks).where(eq(fiscalTasks.id, taskId));
      expect(task).toMatchObject({ state: "closed", closedAt: APPLICATION_NOW });
    });

    it("leaves the deferred sale alone when the void reports no deferred record cancelled", async () => {
      const installation = await system.enrollInstallation();
      const { completed, voided } = await voidedSale(installation, {
        deferredRecordCancelled: false,
      });
      await insertDeferredSaleRow(system.db, { ...installation, saleId: completed.id });

      await record(
        { kind: "sale_voided", creditNote: null, sale: voided },
        eventOf(installation.deviceId, "sale_voided", completed.id),
      );

      const [row] = await system.db.select().from(deferredSales);
      expect(row).toMatchObject({ state: "pending", cancelledAt: null });
    });
  });
});
