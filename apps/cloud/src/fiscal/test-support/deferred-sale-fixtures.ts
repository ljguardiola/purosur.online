import { FICTIONAL_ISSUER } from "@purosur/domain/fiscal/test-support";
import { aDeferredSaleSatisfiedFact } from "@purosur/domain/sync/test-support";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deferredSales, fiscalTasks } from "../../platform/db/schema.js";

const DEFERRED_SALE_OCCURRED_AT = new Date("2026-10-01T15:00:00.000Z");

type DeferredSaleRecordedFact = Extract<SyncedFact, { kind: "deferred_sale_recorded" }>;
type DeferredSaleSatisfiedFact = Extract<SyncedFact, { kind: "deferred_sale_satisfied" }>;

export function aDeferredSaleRecordedFact(
  overrides: Partial<DeferredSaleRecordedFact["deferredSale"]> = {},
): DeferredSaleRecordedFact {
  return {
    kind: "deferred_sale_recorded",
    deferredSale: {
      id: crypto.randomUUID(),
      saleId: crypto.randomUUID(),
      occurredAt: DEFERRED_SALE_OCCURRED_AT,
      total: 4800,
      reason: "pre_emission_gate_failed",
      shortCode: "7KQ4M2P9",
      routedAt: new Date("2026-10-01T15:00:01.000Z"),
      ...overrides,
    },
    unclearDocument: null,
  };
}

export function aDeferredSaleSatisfiedFactOf(
  id: string,
  satisfiedAt: Date,
): DeferredSaleSatisfiedFact {
  const fact = aDeferredSaleSatisfiedFact(FICTIONAL_ISSUER);
  return { ...fact, satisfaction: { ...fact.satisfaction, id, satisfiedAt } };
}

export async function insertDeferredSaleRow<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    registerId,
    locationId,
    ...overrides
  }: Partial<typeof deferredSales.$inferInsert> & { registerId: string; locationId: string },
): Promise<typeof deferredSales.$inferSelect> {
  const [row] = await db
    .insert(deferredSales)
    .values({
      id: crypto.randomUUID(),
      saleId: crypto.randomUUID(),
      registerId,
      locationId,
      occurredAt: DEFERRED_SALE_OCCURRED_AT,
      total: 4800,
      reason: "pre_emission_gate_failed",
      shortCode: "7KQ4M2P9",
      routedAt: new Date("2026-10-01T15:00:01.000Z"),
      state: "pending",
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("test setup: inserting the deferred sale returned no row");
  }
  return row;
}

export async function insertDeferredSaleTaskRow<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    registerId,
    deferredSaleId,
    ...overrides
  }: Partial<typeof fiscalTasks.$inferInsert> & { registerId: string; deferredSaleId: string },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(fiscalTasks).values({
    id,
    kind: "deferred_sale_expired",
    registerId,
    deferredSaleId,
    reason: {},
    state: "open",
    createdAt: new Date("2026-10-10T03:00:00.000Z"),
    ...overrides,
  });
  return id;
}
