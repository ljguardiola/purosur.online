import type { PricedAiCall } from "@purosur/domain";
import type {
  SupplierPriceListAiCalls,
  SupplierPriceListAiCostReader,
} from "@purosur/domain/purchasing/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceListAiCalls, supplierPriceLists } from "../platform/db/schema.js";

export class DrizzleSupplierPriceListAiCostReader<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListAiCostReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async callsOfList(listId: string): Promise<SupplierPriceListAiCalls | undefined> {
    const [list] = await this.db
      .select({ recordedFromStart: supplierPriceLists.aiCallsRecordedFromStart })
      .from(supplierPriceLists)
      .where(eq(supplierPriceLists.id, listId));
    if (!list) {
      return undefined;
    }
    const calls = await this.db
      .select({
        purpose: supplierPriceListAiCalls.purpose,
        costNanoUsd: supplierPriceListAiCalls.costNanoUsd,
      })
      .from(supplierPriceListAiCalls)
      .where(eq(supplierPriceListAiCalls.listId, listId));
    return {
      recordedFromStart: list.recordedFromStart,
      calls: calls.map((call) => ({
        purpose: call.purpose as PricedAiCall["purpose"],
        costNanoUsd: call.costNanoUsd,
      })),
    };
  }
}
