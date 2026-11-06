import type { ActiveProductIdsReader } from "@purosur/domain/stock/use-cases";
import { and, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products } from "../platform/db/schema.js";
import { productActivityCondition } from "./product-activity-condition.js";

export class DrizzleActiveProductIdsReader<TQueryResult extends PgQueryResultHKT>
  implements ActiveProductIdsReader
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async activeProductIds(productIds: readonly string[]): Promise<string[]> {
    const found = await this.tx
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.id, [...productIds]), productActivityCondition("active")));
    return found.map((product) => product.id);
  }
}
