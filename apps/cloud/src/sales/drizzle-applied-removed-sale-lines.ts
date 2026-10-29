import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { removedSaleLines } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

export async function recordAppliedRemovedSaleLine<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { removal }: Extract<SyncedFact, { kind: "sale_line_removed" }>,
  eventId: string,
  appliedAt: Date,
): Promise<void> {
  const { line } = removal;
  await tx
    .insert(removedSaleLines)
    .values({
      ...origin,
      id: line.id,
      saleId: removal.saleId,
      sessionId: removal.sessionId,
      actorId: removal.actorId,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      weightSource: line.weightSource,
      lineTotal: line.lineTotal,
      removedAt: removal.removedAt,
      appliedAt,
      originEventId: eventId,
    })
    .onConflictDoNothing({ target: removedSaleLines.id });
}
