import type { SaleUnit } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { locations } from "../../platform/db/schema.js";
import { insertPackaging } from "../../purchasing/test-support/purchasing-fixtures.js";
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
  packagingName?: string;
  quantityPerPackage?: number;
  packagingActive?: boolean;
  packagingSaleUnit?: SaleUnit;
  priceCents: number;
  pricesIncludeVat?: boolean;
  vatRate?: number | null;
  listDate?: string;
  confirmedAt?: Date;
}

export async function insertLoadedSupplierPrice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  seed: LoadedSupplierPriceSeed,
): Promise<{ supplierItemId: string; supplierId: string }> {
  const [location] = await db.select({ id: locations.id }).from(locations);
  if (!location) {
    throw new Error("test setup: no location seeded");
  }
  const supplierId = await insertSupplier(db, {
    actorId: seed.actorId,
    ...(seed.supplierName === undefined ? {} : { name: seed.supplierName }),
  });
  const packagingId = await insertPackaging(db, {
    productId: seed.productId,
    actorId: seed.actorId,
    quantityPerPackage: seed.quantityPerPackage ?? 1_000,
    ...(seed.packagingName === undefined ? {} : { name: seed.packagingName }),
    ...(seed.packagingActive === undefined ? {} : { active: seed.packagingActive }),
    ...(seed.packagingSaleUnit === undefined ? {} : { saleUnit: seed.packagingSaleUnit }),
  });
  const supplierItemId = await insertSupplierItem(db, {
    supplierId,
    productId: seed.productId,
    packagingId,
    vatRate: seed.vatRate === undefined ? 2_100 : seed.vatRate,
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
    ...(seed.confirmedAt === undefined ? {} : { confirmedAt: seed.confirmedAt }),
  });
  return { supplierItemId, supplierId };
}
