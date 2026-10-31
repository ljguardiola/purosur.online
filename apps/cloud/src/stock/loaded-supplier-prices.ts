import { type SaleUnit, supplierOfferPrice } from "@purosur/domain";
import type { LoadedSupplierPrice } from "@purosur/domain/stock/use-cases";
import { inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { products } from "../platform/db/schema.js";
import { latestSupplierOffers } from "../purchasing/latest-supplier-offers.js";

export async function loadedSupplierPricesOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  productIds: readonly string[],
): Promise<Map<string, LoadedSupplierPrice[]>> {
  const pricesByProduct = new Map<string, LoadedSupplierPrice[]>();
  if (productIds.length === 0) {
    return pricesByProduct;
  }
  const [offers, saleUnits] = await Promise.all([
    latestSupplierOffers(db, productIds),
    db
      .select({ id: products.id, saleUnit: products.saleUnit })
      .from(products)
      .where(inArray(products.id, [...productIds])),
  ]);
  for (const offer of offers) {
    const product = saleUnits.find((row) => row.id === offer.productId);
    if (product === undefined) {
      continue;
    }
    const price = supplierOfferPrice(offer, product.saleUnit as SaleUnit);
    if (price.kind === "priced") {
      pricesByProduct.set(offer.productId, [
        ...(pricesByProduct.get(offer.productId) ?? []),
        {
          supplierItemId: offer.supplierItemId,
          supplierName: offer.supplier.name,
          quantity: offer.link.quantity,
          saleUnit: offer.link.saleUnit,
          listDate: offer.listDate,
          pricePerSaleUnit: price.pricePerSaleUnit,
        },
      ]);
    }
  }
  return pricesByProduct;
}
