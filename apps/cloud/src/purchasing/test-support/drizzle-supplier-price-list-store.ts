import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach } from "vitest";
import {
  locations,
  supplierPriceListRemovedItems,
  supplierPriceListRereads,
  supplierPriceListRows,
  supplierPriceLists,
} from "../../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../../test-support/build-test-database.js";
import { seededLocationId } from "../../test-support/seeded-location.js";
import { DrizzleSupplierPriceListStore } from "../drizzle-supplier-price-list-store.js";
import { insertActor } from "./purchasing-fixtures.js";
import { insertSupplier } from "./supplier-price-list-fixtures.js";

export const NOW = new Date("2026-03-10T15:00:00.000Z");

export function supplierPriceListStoreDatabase() {
  let testDatabase: TestDatabase;
  const context = {
    get db() {
      return testDatabase.db;
    },
    actorId: "",
    locationId: "",
    supplierId: "",
    store: () => new DrizzleSupplierPriceListStore(testDatabase.db, () => NOW),
    async otherLocationId() {
      const [location] = await testDatabase.db
        .insert(locations)
        .values({})
        .returning({ id: locations.id });
      if (!location) {
        throw new Error("test setup: seeding the location returned no row");
      }
      return location.id;
    },
    async listRow(listId: string) {
      const [row] = await testDatabase.db
        .select()
        .from(supplierPriceLists)
        .where(eq(supplierPriceLists.id, listId));
      return row;
    },
    rowsOf(listId: string) {
      return testDatabase.db
        .select()
        .from(supplierPriceListRows)
        .where(eq(supplierPriceListRows.listId, listId))
        .orderBy(asc(supplierPriceListRows.position));
    },
    async rereadRow(rereadId: string) {
      const [row] = await testDatabase.db
        .select()
        .from(supplierPriceListRereads)
        .where(eq(supplierPriceListRereads.id, rereadId));
      return row;
    },
    removedItemsOf(listId: string) {
      return testDatabase.db
        .select()
        .from(supplierPriceListRemovedItems)
        .where(eq(supplierPriceListRemovedItems.listId, listId));
    },
  };

  beforeAll(async () => {
    testDatabase = await buildTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.close();
  });

  beforeEach(async () => {
    await testDatabase.clear();
    context.actorId = await insertActor(testDatabase.db);
    context.locationId = await seededLocationId(testDatabase.db);
    context.supplierId = await insertSupplier(testDatabase.db, { actorId: context.actorId });
  });

  return context;
}
