import { newestPrice } from "@purosur/domain";
import type { CurrentPrice } from "@purosur/domain/pricing/use-cases";
import { and, eq, max, sql } from "drizzle-orm";
import { alias, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { prices, products } from "../platform/db/schema.js";

export async function newestPricesOfList<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  priceListId: string,
  scope: "active-products" | "all-products",
): Promise<Map<string, CurrentPrice>> {
  const every = alias(prices, "every_price");
  const newestPrices = db
    .select({
      id: prices.id,
      unitPrice: prices.unitPrice,
      validFrom: prices.validFrom,
    })
    .from(prices)
    .where(
      and(
        eq(prices.productId, products.id),
        eq(prices.priceListId, priceListId),
        eq(
          prices.validFrom,
          db
            .select({ validFrom: max(every.validFrom) })
            .from(every)
            .where(and(eq(every.productId, products.id), eq(every.priceListId, priceListId))),
        ),
      ),
    )
    .as("newest_prices");
  const priceRows = await db
    .select({
      productId: products.id,
      id: newestPrices.id,
      unitPrice: newestPrices.unitPrice,
      validFrom: newestPrices.validFrom,
    })
    .from(products)
    .innerJoinLateral(newestPrices, sql`true`)
    .where(scope === "active-products" ? eq(products.active, true) : undefined);

  const pricesByProductId = new Map<string, (typeof priceRows)[number][]>();
  for (const row of priceRows) {
    const productPrices = pricesByProductId.get(row.productId);
    if (productPrices) {
      productPrices.push(row);
    } else {
      pricesByProductId.set(row.productId, [row]);
    }
  }
  const newestByProductId = new Map<string, CurrentPrice>();
  for (const [productId, productPrices] of pricesByProductId) {
    const current = newestPrice(productPrices);
    if (current) {
      newestByProductId.set(productId, {
        id: current.id,
        unitPrice: current.unitPrice,
        validFrom: current.validFrom,
      });
    }
  }
  return newestByProductId;
}
