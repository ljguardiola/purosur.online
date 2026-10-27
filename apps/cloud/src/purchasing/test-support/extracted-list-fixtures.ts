import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { supplierPriceListRows, supplierPriceLists } from "../../platform/db/schema.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { insertActor } from "./purchasing-fixtures.js";
import {
  insertPriceList,
  insertPriceListRows,
  insertSupplier,
} from "./supplier-price-list-fixtures.js";

export async function extractedListWithRow<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  list: Partial<Parameters<typeof insertPriceList>[1]> = {},
  row: Parameters<typeof insertPriceListRows>[2][number] = {},
) {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  const supplierId = await insertSupplier(db, { actorId });
  const listId = await insertPriceList(db, {
    supplierId,
    locationId,
    actorId,
    state: "EXTRACTED",
    listDate: "2026-03-01",
    pricesIncludeVat: false,
    ...list,
  });
  const [rowId] = await insertPriceListRows(db, listId, [row]);
  return { listId, rowId: rowId as string, actorId, supplierId };
}

export async function storedListRow<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  rowId: string,
) {
  const [row] = await db
    .select()
    .from(supplierPriceListRows)
    .where(eq(supplierPriceListRows.id, rowId));
  return row;
}

export async function storedListVersion<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  listId: string,
) {
  const [list] = await db
    .select()
    .from(supplierPriceLists)
    .where(eq(supplierPriceLists.id, listId));
  return list?.version;
}
