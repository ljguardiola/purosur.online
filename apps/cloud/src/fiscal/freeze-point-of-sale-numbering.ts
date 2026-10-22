import type { NumberingFreeze } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { numberingFreezes } from "../platform/db/schema.js";
import type { PendingChanges } from "../sync/change-log.js";
import type { EnqueueNumberingReconciliation } from "./enqueue-numbering-conflict.js";
import { notePointOfSaleHolderChanged } from "./note-point-of-sale-holder-changed.js";

export async function freezePointOfSaleNumbering<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  pending: PendingChanges,
  {
    pointOfSale,
    freeze,
    enqueueReconciliation,
  }: {
    pointOfSale: number;
    freeze: NumberingFreeze;
    enqueueReconciliation: EnqueueNumberingReconciliation;
  },
): Promise<void> {
  await tx
    .insert(numberingFreezes)
    .values({ pointOfSaleNumber: pointOfSale, ...freeze })
    .onConflictDoNothing();
  await notePointOfSaleHolderChanged(tx, pending, pointOfSale);
  await enqueueReconciliation(tx, pointOfSale);
}
