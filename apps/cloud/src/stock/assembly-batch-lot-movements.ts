import type { BatchLotMovement } from "@purosur/domain/stock/use-cases";
import { eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { lotAllocations, lots, stockMovements } from "../platform/db/schema.js";

export async function batchLotMovements<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  batchIds: readonly string[],
): Promise<Map<string, BatchLotMovement[]>> {
  const rows = await db
    .selectDistinct({
      lotBatchId: lots.assemblyBatchId,
      assemblyBatchId: stockMovements.assemblyBatchId,
    })
    .from(lotAllocations)
    .innerJoin(lots, eq(lots.id, lotAllocations.lotId))
    .innerJoin(stockMovements, eq(stockMovements.id, lotAllocations.movementId))
    .where(inArray(lots.assemblyBatchId, [...batchIds]));
  const found = new Map<string, BatchLotMovement[]>();
  for (const { lotBatchId, assemblyBatchId } of rows) {
    if (lotBatchId !== null) {
      found.set(lotBatchId, [...(found.get(lotBatchId) ?? []), { assemblyBatchId }]);
    }
  }
  return found;
}
