import type {
  ProductCoverageDays,
  ProductCoverageDaysReader,
} from "@purosur/domain/purchasing/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products } from "../platform/db/schema.js";
import { productActivityCondition } from "./product-activity-condition.js";

export class DrizzleProductCoverageDaysReader<TQueryResult extends PgQueryResultHKT>
  implements ProductCoverageDaysReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async coverageDays(): Promise<ProductCoverageDays[]> {
    return this.db
      .select({ productId: products.id, coverageDays: products.coverageDays })
      .from(products)
      .where(productActivityCondition("active"));
  }
}
