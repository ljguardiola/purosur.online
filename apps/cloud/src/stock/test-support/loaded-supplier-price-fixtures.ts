import type { SaleUnit } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { locations } from "../../platform/db/schema.js";
import {
  insertPriceList,
  insertSupplier,
  insertSupplierItem,
  insertSupplierItemPrice,
} from "../../purchasing/test-support/supplier-price-list-fixtures.js";

export interface LoadedSupplierPriceSeed {
  productId: string;
  actorId: string;
  supplierName?: string;
  quantity?: number;
  linkSaleUnit?: SaleUnit;
  priceCents: number;
  pricesIncludeVat?: boolean;
  vatRate?: number;
  listDate?: string;
}

export async function insertLoadedSupplierPrice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  seed: LoadedSupplierPriceSeed,
): Promise<{ supplierItemId: string }> {
  const [location] = await db.select({ id: locations.id }).from(locations);
  if (!location) {
    throw new Error("test setup: no location seeded");
  }
  const supplierId = await insertSupplier(db, {
    actorId: seed.actorId,
    ...(seed.supplierName === undefined ? {} : { name: seed.supplierName }),
  });
  const supplierItemId = await insertSupplierItem(db, {
    supplierId,
    productId: seed.productId,
    quantity: seed.quantity ?? 1_000,
    saleUnit: seed.linkSaleUnit ?? "UNIT",
    vatRate: seed.vatRate ?? 2_100,
  });
  const listId = await insertPriceList(db, {
    supplierId,
    locationId: location.id,
    actorId: seed.actorId,
    state: "REVIEWED",
  });
  await insertSupplierItemPrice(db, {
    itemId: supplierItemId,
    listId,
    priceCents: seed.priceCents,
    pricesIncludeVat: seed.pricesIncludeVat ?? true,
    ...(seed.listDate === undefined ? {} : { listDate: seed.listDate }),
  });
  return { supplierItemId };
}
