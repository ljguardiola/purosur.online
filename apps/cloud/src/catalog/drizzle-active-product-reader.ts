import type { ActiveProductReader } from "@purosur/domain/pricing/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products } from "../platform/db/schema.js";
import { productActivityCondition } from "./product-activity-condition.js";

export class DrizzleActiveProductReader<TQueryResult extends PgQueryResultHKT>
  implements ActiveProductReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async isActiveProduct(productId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), productActivityCondition("active")));
    return found !== undefined;
  }
}
