import {
  CLOSED_FISCAL_TASK_STATE,
  type DeferredSaleState,
  deferredSaleSettlement,
  OPEN_FISCAL_TASK_STATE,
  PENDING_DEFERRED_SALE_STATE,
} from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { and, eq, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deferredSales, fiscalTasks } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

export async function recordAppliedDeferredSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { registerId, locationId }: AppliedOrigin,
  { deferredSale }: Extract<SyncedFact, { kind: "deferred_sale_recorded" }>,
): Promise<void> {
  await tx
    .insert(deferredSales)
    .values({
      id: deferredSale.id,
      saleId: deferredSale.saleId,
      registerId,
      locationId,
      occurredAt: deferredSale.occurredAt,
      total: deferredSale.total,
      reason: deferredSale.reason,
      shortCode: deferredSale.shortCode,
      routedAt: deferredSale.routedAt,
      state: PENDING_DEFERRED_SALE_STATE,
    })
    .onConflictDoNothing();
}

async function settleDeferredSales<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  which: SQL,
  settling: "satisfied" | "cancelled",
  { settledAt, closedAt }: { settledAt: Date; closedAt: Date },
): Promise<void> {
  const held = await tx
    .select({ id: deferredSales.id, state: deferredSales.state })
    .from(deferredSales)
    .where(which)
    .for("update");
  for (const { id, state } of held) {
    const settlement = deferredSaleSettlement(state as DeferredSaleState, settling);
    if (settlement.state === state) {
      continue;
    }
    await tx
      .update(deferredSales)
      .set(
        settling === "satisfied"
          ? { state: settlement.state, satisfiedAt: settledAt }
          : { state: settlement.state, cancelledAt: settledAt },
      )
      .where(eq(deferredSales.id, id));
    if (settlement.closesRegularizationTask) {
      await tx
        .update(fiscalTasks)
        .set({ state: CLOSED_FISCAL_TASK_STATE, closedAt })
        .where(
          and(eq(fiscalTasks.deferredSaleId, id), eq(fiscalTasks.state, OPEN_FISCAL_TASK_STATE)),
        );
    }
  }
}

export function recordAppliedDeferredSaleSatisfaction<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { satisfaction }: Extract<SyncedFact, { kind: "deferred_sale_satisfied" }>,
  closedAt: Date,
): Promise<void> {
  return settleDeferredSales(tx, eq(deferredSales.id, satisfaction.id), "satisfied", {
    settledAt: satisfaction.satisfiedAt,
    closedAt,
  });
}

export async function recordAppliedDeferredSaleCancellation<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { registerId }: AppliedOrigin,
  { sale }: Extract<SyncedFact, { kind: "sale_voided" }>,
  closedAt: Date,
): Promise<void> {
  if (!sale.deferredRecordCancelled) {
    return;
  }
  await settleDeferredSales(
    tx,
    and(eq(deferredSales.saleId, sale.id), eq(deferredSales.registerId, registerId)) as SQL,
    "cancelled",
    { settledAt: sale.voidedAt, closedAt },
  );
}
