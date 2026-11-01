import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { latestSupplierOffers } from "./latest-supplier-offers.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import {
  insertPriceList,
  insertSupplier,
  insertSupplierItem,
  insertSupplierItemPrice,
} from "./test-support/supplier-price-list-fixtures.js";

// postgres-js hands a bigint column over as a string unless the select decodes it; PGlite hands
// it over as a number.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("latest_supplier_offers");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("reading the latest supplier offers on a real Postgres through postgres-js", () => {
  it("answers the link's quantity as a number", async () => {
    const actorId = await insertActor(db);
    const locationId = await seededLocationId(db);
    const { id: productId } = await insertProduct(db, { name: "Yerba 1 kg" });
    const supplierId = await insertSupplier(db, { actorId, name: "Alfa" });
    const itemId = await insertSupplierItem(db, {
      supplierId,
      productId,
      quantity: 6_000,
      saleUnit: "UNIT",
      vatRate: 1_050,
    });
    await insertSupplierItemPrice(db, {
      itemId,
      listId: await insertPriceList(db, { supplierId, locationId, actorId, state: "REVIEWED" }),
      priceCents: 1_000,
      listDate: "2026-03-01",
      pricesIncludeVat: false,
    });

    const [offer] = await latestSupplierOffers(db, [productId]);

    expect(offer?.link).toEqual({ quantity: 6_000, saleUnit: "UNIT", relinkRequired: false });
  });
});
