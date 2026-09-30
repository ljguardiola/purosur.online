import { createCategory, createProduct, createTag } from "@purosur/domain/catalog/use-cases";
import { setPrice } from "@purosur/domain/pricing/use-cases";
import { pullChanges } from "@purosur/domain/sync/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRole } from "../access/role-creation-route.js";
import { createUser } from "../access/user-creation-route.js";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { users } from "../platform/db/schema.js";
import { DrizzlePricingStore } from "../pricing/drizzle-pricing-store.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzleChangeLog } from "./drizzle-change-log.js";

// PGlite has no roles, so only a real Postgres connected as the role the deployed cloud uses shows
// which privileges a pull's reads need.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("pull_as_cloud_app");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("a pull run as the role the deployed cloud connects with", () => {
  it("gives a page holding every kind of catalog, price, user and role change", async () => {
    const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db);
    const store = new DrizzleCatalogStore(db);
    const category = await createCategory(store, { name: "Almacén", parentId: null });
    const tag = await createTag(store, { name: "Sin TACC" });
    if (category.kind !== "created" || tag.kind !== "created") {
      throw new Error("test setup: the category or the tag was not created");
    }
    const product = await createProduct(store, {
      name: "Arroz",
      categoryId: category.category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7790001000011"],
      netContent: null,
      tagIds: [tag.tag.id],
    });
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email: "ada@example.com", locationId })
      .returning({ id: users.id });
    if (product.kind !== "created" || !actor) {
      throw new Error("test setup: the product or the actor was not created");
    }
    const role = await createRole(db, {
      name: "Cajera",
      permissionKeys: ["sell_and_charge"],
      actorId: actor.id,
    });
    if (role.kind !== "created") {
      throw new Error("test setup: the role was not created");
    }
    await createUser(
      db,
      {
        firstName: "Grace",
        email: "grace@example.com",
        roleId: role.role.id,
        locationId,
        actorId: actor.id,
      },
      { now: () => new Date() },
    );
    await setPrice(
      { store: new DrizzlePricingStore(db), clock: { now: () => new Date() } },
      {
        productId: product.product.id,
        priceListId: await seededPriceListId(db),
        unitPrice: 1000,
        expectedCurrentPriceId: null,
        actorId: actor.id,
      },
    );
    const ports = { changeLog: new DrizzleChangeLog(db), clock: { now: () => new Date() } };

    const page = await pullChanges(ports, { deviceId, locationId, registerId, since: 0 });

    expect(page.changes.map((change) => change.entity).sort()).toEqual([
      "branch_settings",
      "category",
      "price",
      "price_list",
      "product",
      "role",
      "role",
      "tag",
      "user",
    ]);
  });
});
