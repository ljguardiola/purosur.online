import type { ActiveProductLock, LockActiveProductResult } from "@purosur/domain/pricing/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products } from "../platform/db/schema.js";
import { productActivityCondition } from "./product-activity-condition.js";

export class DrizzleActiveProductLock<TQueryResult extends PgQueryResultHKT>
  implements ActiveProductLock
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async lockActiveProduct(productId: string): Promise<LockActiveProductResult> {
    const [product] = await this.tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), productActivityCondition("active")))
      .for("update");
    return product ? { kind: "locked" } : { kind: "not_found" };
  }
}
