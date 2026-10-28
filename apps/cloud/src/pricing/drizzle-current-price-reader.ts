import type { CurrentPriceReader } from "@purosur/domain/pricing/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchSettings } from "../platform/db/schema.js";
import { newestPricesOfList } from "./newest-prices-of-list.js";

export class DrizzleCurrentPriceReader<TQueryResult extends PgQueryResultHKT>
  implements CurrentPriceReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async currentUnitPrices(locationId: string): Promise<Map<string, number>> {
    const [settings] = await this.db
      .select({ priceListId: branchSettings.priceListId })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, locationId));
    if (!settings) {
      throw new Error(`branch settings missing for location ${locationId}`);
    }
    const newest = await newestPricesOfList(this.db, settings.priceListId, "all-products");
    return new Map([...newest].map(([productId, price]) => [productId, price.unitPrice]));
  }
}
