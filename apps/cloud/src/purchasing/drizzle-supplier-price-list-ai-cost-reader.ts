import type { PricedAiCall } from "@purosur/domain";
import type {
  SupplierPriceListAiCostQuery,
  SupplierPriceListAiCostReader,
} from "@purosur/domain/purchasing/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceListAiCalls, supplierPriceLists } from "../platform/db/schema.js";

export class DrizzleSupplierPriceListAiCostReader<TQueryResult extends PgQueryResultHKT>
  implements SupplierPriceListAiCostReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async callsOfList({
    locationId,
    listId,
  }: SupplierPriceListAiCostQuery): Promise<PricedAiCall[] | undefined> {
    const [list] = await this.db
      .select({ id: supplierPriceLists.id })
      .from(supplierPriceLists)
      .where(and(eq(supplierPriceLists.id, listId), eq(supplierPriceLists.locationId, locationId)));
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
    return calls.map((call) => ({
      purpose: call.purpose as PricedAiCall["purpose"],
      costNanoUsd: call.costNanoUsd,
    }));
  }
}
