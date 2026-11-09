import { isDiscountLive } from "@purosur/domain";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { discounts } from "../platform/db/schema.js";

export async function liveBuyNPayMDiscountNamesOn<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  productId: string,
  today: string,
): Promise<string[]> {
  const onProduct = await tx
    .select({
      name: discounts.name,
      active: discounts.active,
      validFrom: discounts.validFrom,
      validTo: discounts.validTo,
    })
    .from(discounts)
    .where(and(eq(discounts.productId, productId), eq(discounts.kind, "BUY_N_PAY_M")));
  return onProduct
    .filter((discount) => isDiscountLive(discount, today))
    .map((discount) => discount.name);
}
