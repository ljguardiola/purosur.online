import type { AiCallRecord } from "@purosur/domain/purchasing/use-cases";
import { inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceListAiCalls, supplierPriceLists } from "../platform/db/schema.js";

export async function insertAiCallRecords<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  records: AiCallRecord[],
): Promise<void> {
  if (records.length === 0) {
    return;
  }
  const lists = await tx
    .select({
      id: supplierPriceLists.id,
      supplierId: supplierPriceLists.supplierId,
      locationId: supplierPriceLists.locationId,
    })
    .from(supplierPriceLists)
    .where(inArray(supplierPriceLists.id, [...new Set(records.map((record) => record.listId))]));
  const listsById = new Map(lists.map((list) => [list.id, list]));
  await tx.insert(supplierPriceListAiCalls).values(
    records.map((record) => {
      const list = listsById.get(record.listId);
      if (!list) {
        throw new Error("recording an AI call of a price list that does not exist");
      }
      return {
        listId: record.listId,
        rowId: record.rowId,
        purpose: record.purpose,
        supplierId: list.supplierId,
        locationId: list.locationId,
        actorId: record.actorId,
        occurredAt: record.occurredAt,
        occurredOn: record.occurredOn,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheWriteTokens: record.cacheWriteTokens,
        cacheReadTokens: record.cacheReadTokens,
        outcome: record.outcome,
        costNanoUsd: record.costNanoUsd,
      };
    }),
  );
}
