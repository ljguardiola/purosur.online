import type { AiCallRecord } from "@purosur/domain/purchasing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceListAiCalls } from "../../platform/db/schema.js";

export interface AiCallSeed {
  listId: string;
  supplierId: string;
  locationId: string;
  actorId: string;
  purpose?: AiCallRecord["purpose"];
  occurredOn?: string;
  costNanoUsd?: number | null;
  outcome?: AiCallRecord["outcome"];
}

export async function insertAiCall<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  seed: AiCallSeed,
): Promise<void> {
  await db.insert(supplierPriceListAiCalls).values({
    listId: seed.listId,
    rowId: null,
    purpose: seed.purpose ?? "READING",
    supplierId: seed.supplierId,
    locationId: seed.locationId,
    actorId: seed.actorId,
    occurredAt: new Date("2026-10-12T15:00:00.000Z"),
    occurredOn: seed.occurredOn ?? "2026-10-12",
    model: "claude-sonnet-5-5",
    inputTokens: 1_000,
    outputTokens: 200,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outcome: seed.outcome ?? "completed",
    costNanoUsd: seed.costNanoUsd === undefined ? 4_000_000 : seed.costNanoUsd,
  });
}
