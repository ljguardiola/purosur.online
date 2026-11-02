import type { SaleUnit } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { locations } from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { insertProduct } from "./purchasing-fixtures.js";
import {
  insertPriceList,
  insertSupplier,
  insertSupplierItem,
  insertSupplierItemPrice,
} from "./supplier-price-list-fixtures.js";

export async function insertAnotherLocation<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the location returned no row");
  }
  return location.id;
}

export interface OfferedItem {
  quantity: number;
  priceCents: number;
  listDate?: string;
  confirmedAt?: Date;
  saleUnit?: SaleUnit;
  relinkRequired?: boolean;
  vatRate?: number | null;
  pricesIncludeVat?: boolean;
  keyKind?: "code" | "description";
  keyValue?: string;
  description?: string;
}

export async function insertOfferedItem<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { supplierId: string; productId: string; actorId: string } & OfferedItem,
): Promise<string> {
  const locationId = await seededLocationId(db);
  const itemId = await insertSupplierItem(db, {
    supplierId: input.supplierId,
    productId: input.productId,
    quantity: input.quantity,
    saleUnit: input.saleUnit ?? "UNIT",
    relinkRequired: input.relinkRequired ?? false,
    vatRate: input.vatRate === undefined ? 2_100 : input.vatRate,
    ...(input.keyKind === undefined ? {} : { keyKind: input.keyKind }),
    ...(input.keyValue === undefined ? {} : { keyValue: input.keyValue }),
    ...(input.description === undefined ? {} : { description: input.description }),
  });
  await insertSupplierItemPrice(db, {
    itemId,
    listId: await insertPriceList(db, {
      supplierId: input.supplierId,
      locationId,
      actorId: input.actorId,
      state: "REVIEWED",
    }),
    priceCents: input.priceCents,
    listDate: input.listDate ?? "2026-03-01",
    pricesIncludeVat: input.pricesIncludeVat ?? false,
    ...(input.confirmedAt === undefined ? {} : { confirmedAt: input.confirmedAt }),
  });
  return itemId;
}

export async function insertOfferedProduct<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: { actorId: string; name: string; saleUnit?: SaleUnit; supplierId?: string } & OfferedItem,
): Promise<{ productId: string; supplierId: string }> {
  const { id: productId } = await insertProduct(db, {
    name: input.name,
    ...(input.saleUnit === undefined ? {} : { saleUnit: input.saleUnit }),
  });
  const supplierId = input.supplierId ?? (await insertSupplier(db, { actorId: input.actorId }));
  await insertOfferedItem(db, { ...input, productId, supplierId });
  return { productId, supplierId };
}
