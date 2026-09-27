import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { openAlert } from "../alerts/open-alert.js";
import { createCategory } from "../categories/category-creation-route.js";
import {
  alerts,
  branchSettings,
  categories,
  passkeyChallenges,
  products,
  recoveryTokens,
  registers,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { confirmPrice } from "../prices/price-confirmation-route.js";
import { setPrice } from "../prices/price-set-route.js";
import { createProduct } from "../products/product-creation-route.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { createRegister } from "../registers/register-creation-route.js";
import { createRole } from "../roles/role-creation-route.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { createUser } from "../users/user-creation-route.js";
import { clearSampleData } from "./clear-sample-data.js";
import { loadSampleData } from "./load-sample-data.js";
import { SAMPLE_ADMINISTRATOR, sampleEmail } from "./sample-catalog.js";

const NOW = new Date("2026-04-01T09:00:00.000Z");

let integrationDb: IntegrationDatabase | undefined;

afterEach(async () => {
  await integrationDb?.close();
  integrationDb = undefined;
});

// Clearing disables `products_reject_deletion` (ALTER TABLE) and deletes append-only price and
// audit rows, none of which `cloud_app` may do; the admin connection models the local table owner
// this command actually runs as.
async function freshOwnerDatabase(): Promise<PostgresJsDatabase<Record<string, never>>> {
  integrationDb = await createIntegrationDatabase("sample_data_clear");
  return drizzle(postgres(integrationDb.adminDatabaseUrl, { max: 5 }));
}

async function seedActiveAdministrator(
  db: PostgresJsDatabase<Record<string, never>>,
): Promise<{ id: string; locationId: string }> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  const locationId = await seededLocationId(db);
  const [administrator] = await db
    .insert(users)
    .values({
      firstName: "Bootstrap Admin",
      email: `bootstrap-${randomUUID()}@example.com`,
      locationId,
    })
    .returning({ id: users.id });
  if (!administrator) {
    throw new Error("test setup: inserting the bootstrap administrator returned no row");
  }
  await db.insert(userRoles).values({ userId: administrator.id, roleId: administratorRole.id });
  return { id: administrator.id, locationId };
}

async function tableCount(
  db: PostgresJsDatabase<Record<string, never>>,
  tableName: string,
): Promise<number> {
  const [row] = await db.execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from "${tableName}"`),
  );
  return row ? Number((row as unknown as { count: number }).count) : 0;
}

async function sampleDataSnapshot(
  db: PostgresJsDatabase<Record<string, never>>,
): Promise<Record<string, number>> {
  const snapshot: Record<string, number> = {};
  for (const tableName of [
    "users",
    "roles",
    "categories",
    "products",
    "prices",
    "price_reviews",
    "registers",
    "alerts",
    "alert_deliveries",
    "audit_log",
    "branch_hours",
  ]) {
    snapshot[tableName] = await tableCount(db, tableName);
  }
  return snapshot;
}

async function sampleCategoryIdByPath(
  db: PostgresJsDatabase<Record<string, never>>,
  topName: string,
  midName: string,
  leafName: string,
): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`select leaf.id from categories leaf
        join categories mid on mid.id = leaf.parent_id
        join categories top on top.id = mid.parent_id
        where top.parent_id is null and top.name = ${topName}
          and mid.name = ${midName} and leaf.name = ${leafName}`,
  );
  const id = (rows as unknown as { id: string }[])[0]?.id;
  if (!id) throw new Error(`test setup: no sample category ${topName} > ${midName} > ${leafName}`);
  return id;
}

async function userIdByEmail(
  db: PostgresJsDatabase<Record<string, never>>,
  email: string,
): Promise<string> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!row) throw new Error(`test setup: no user with email ${email}`);
  return row.id;
}

async function branchPriceListIdOf(
  db: PostgresJsDatabase<Record<string, never>>,
  locationId: string,
): Promise<string> {
  const [row] = await db
    .select({ priceListId: branchSettings.priceListId })
    .from(branchSettings)
    .where(eq(branchSettings.locationId, locationId));
  if (!row) throw new Error("test setup: no price list seeded");
  return row.priceListId;
}

describe("clearSampleData", () => {
  it("is a no-op when nothing was loaded", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);

    const outcome = await clearSampleData(db);

    expect(outcome).toEqual({ kind: "not_loaded" });
    expect(await tableCount(db, "users")).toBe(1);
    expect(await tableCount(db, "roles")).toBe(1);
  });

  it("returns every table to its pre-load state, leaving the administrator and other real data untouched", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);

    const realRoleOutcome = await createRole(db, {
      name: "Cajera Real",
      permissionKeys: ["sell_and_charge"],
      actorId: bootstrapAdmin.id,
    });
    if (realRoleOutcome.kind !== "created") throw new Error("test setup: real role collided");
    const realUserOutcome = await createUser(db, {
      firstName: "Usuaria Real",
      email: "cajera.real@example.com",
      roleId: realRoleOutcome.role.id,
      locationId: bootstrapAdmin.locationId,
      actorId: bootstrapAdmin.id,
    });
    if (realUserOutcome.kind !== "created") throw new Error("test setup: real user collided");

    const realCategoryOutcome = await createCategory(db, {
      name: "Categoría Real",
      parentId: null,
    });
    if (realCategoryOutcome.kind !== "created")
      throw new Error("test setup: real category collided");
    const realProductOutcome = await createProduct(db, {
      name: "Producto Real",
      categoryId: realCategoryOutcome.category.id,
      saleUnit: "UNIT",
      barcodes: ["7791234567890"],
    });
    if (realProductOutcome.kind !== "created") throw new Error("test setup: real product collided");
    const priceListRow = await db.execute<{ price_list_id: string }>(
      sql`select price_list_id from branch_settings where location_id = ${bootstrapAdmin.locationId}`,
    );
    const realPriceListId = (priceListRow as unknown as { price_list_id: string }[])[0]
      ?.price_list_id;
    if (!realPriceListId) throw new Error("test setup: no price list seeded");
    const realPriceOutcome = await setPrice(db, {
      productId: realProductOutcome.product.id,
      priceListId: realPriceListId,
      unitPrice: 1000,
      expectedCurrentPriceId: null,
      actorId: bootstrapAdmin.id,
      now: () => NOW,
    });
    if (realPriceOutcome.kind !== "applied") throw new Error("test setup: real price failed");

    const realRegisterOutcome = await createRegister(db, {
      locationId: bootstrapAdmin.locationId,
      name: "Caja Real",
      actorId: bootstrapAdmin.id,
    });
    if (realRegisterOutcome.kind !== "created")
      throw new Error("test setup: real register collided");

    const realAlertOutcome = await db.transaction((tx) =>
      openAlert(
        tx,
        { kind: "backoffice_recovery_requested", scope: realUserOutcome.id, detail: {} },
        { now: () => NOW },
      ),
    );
    if (realAlertOutcome.kind !== "opened") throw new Error("test setup: real alert failed");

    const loadOutcome = await loadSampleData(db, { now: () => NOW });
    expect(loadOutcome.kind).toBe("loaded");

    const clearOutcome = await clearSampleData(db);
    expect(clearOutcome.kind).toBe("cleared");

    expect(await tableCount(db, "users")).toBe(2);
    expect(await tableCount(db, "roles")).toBe(2);
    expect(await tableCount(db, "categories")).toBe(1);
    expect(await tableCount(db, "products")).toBe(1);
    expect(await tableCount(db, "registers")).toBe(1);
    expect(await tableCount(db, "alerts")).toBe(1);

    const [survivingRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.id, realRoleOutcome.role.id));
    expect(survivingRole).toMatchObject({ name: "Cajera Real" });
    const [survivingUser] = await db.select().from(users).where(eq(users.id, realUserOutcome.id));
    expect(survivingUser).toMatchObject({
      firstName: "Usuaria Real",
      email: "cajera.real@example.com",
    });
    const [survivingCategory] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, realCategoryOutcome.category.id));
    expect(survivingCategory).toMatchObject({ name: "Categoría Real" });
    const [survivingProduct] = await db
      .select()
      .from(products)
      .where(eq(products.id, realProductOutcome.product.id));
    expect(survivingProduct).toMatchObject({ name: "Producto Real", active: true });
    const [survivingRegister] = await db
      .select()
      .from(registers)
      .where(eq(registers.id, realRegisterOutcome.register.id));
    expect(survivingRegister).toMatchObject({ name: "Caja Real" });
    const [survivingAlert] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, realAlertOutcome.alertId));
    expect(survivingAlert).toMatchObject({ scope: realUserOutcome.id });

    const [settingsRow] = await db.select().from(branchSettings);
    expect(settingsRow).toMatchObject({ address: "", whatsappNumber: "", instagramHandle: "" });
    expect(await tableCount(db, "branch_hours")).toBe(0);
  }, 120_000);
  it("leaves a real category that shares a sample category's name under another parent untouched, with its products", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    const realTop = await createCategory(db, { name: "Categoría Real", parentId: null });
    if (realTop.kind !== "created") throw new Error("test setup: real category collided");
    const realNamesake = await createCategory(db, {
      name: "Aceites",
      parentId: realTop.category.id,
    });
    if (realNamesake.kind !== "created") throw new Error("test setup: real namesake collided");
    const realProduct = await createProduct(db, {
      name: "Aceite Real",
      categoryId: realNamesake.category.id,
      saleUnit: "UNIT",
      barcodes: ["7791234567890"],
    });
    if (realProduct.kind !== "created") throw new Error("test setup: real product collided");

    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    expect((await clearSampleData(db)).kind).toBe("cleared");

    const survivingCategories = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, realTop.category.id));
    expect(survivingCategories).toEqual([{ id: realNamesake.category.id }]);
    const survivingProducts = await db.select({ id: products.id }).from(products);
    expect(survivingProducts).toEqual([{ id: realProduct.product.id }]);
  }, 120_000);

  it("refuses and deletes nothing when a real product sits in a sample category", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const sampleLeafId = await sampleCategoryIdByPath(
      db,
      "Almacén",
      "Aceites y Aderezos",
      "Aceites",
    );
    const realProduct = await createProduct(db, {
      name: "Aceite Real",
      categoryId: sampleLeafId,
      saleUnit: "UNIT",
      barcodes: ["7791234567890"],
    });
    if (realProduct.kind !== "created") throw new Error("test setup: real product collided");
    const beforeClear = await sampleDataSnapshot(db);

    const outcome = await clearSampleData(db);

    expect(outcome.kind).toBe("refused");
    expect(await sampleDataSnapshot(db)).toEqual(beforeClear);
  }, 120_000);
  it("clears a sample user who left a recovery token, a session with a pending passkey challenge and deliveries of a real alert", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const sampleCashierId = await userIdByEmail(db, sampleEmail("cajera.muestra"));
    await db.insert(recoveryTokens).values({
      userId: sampleCashierId,
      tokenHash: randomUUID(),
      expiresAt: new Date(NOW.getTime() + 3_600_000),
    });
    const [session] = await db
      .insert(sessions)
      .values({ userId: sampleCashierId, sessionIdHash: randomUUID() })
      .returning({ id: sessions.id });
    if (!session) throw new Error("test setup: inserting the session returned no row");
    await db.insert(passkeyChallenges).values({
      sessionId: session.id,
      kind: "registration",
      registrationChallenge: "pending-challenge",
    });
    const realAlert = await db.transaction((tx) =>
      openAlert(
        tx,
        { kind: "backoffice_recovery_requested", scope: bootstrapAdmin.id, detail: {} },
        { now: () => NOW },
      ),
    );
    if (realAlert.kind !== "opened") throw new Error("test setup: real alert failed");

    expect((await clearSampleData(db)).kind).toBe("cleared");

    expect(await tableCount(db, "recovery_tokens")).toBe(0);
    expect(await tableCount(db, "sessions")).toBe(0);
    expect(await tableCount(db, "passkey_challenges")).toBe(0);
    const survivingAlerts = await db.select({ id: alerts.id }).from(alerts);
    expect(survivingAlerts).toEqual([{ id: realAlert.alertId }]);
  }, 120_000);

  it("refuses and deletes nothing when a sample user reviewed a real product's price", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    const realCategory = await createCategory(db, { name: "Categoría Real", parentId: null });
    if (realCategory.kind !== "created") throw new Error("test setup: real category collided");
    const realProduct = await createProduct(db, {
      name: "Producto Real",
      categoryId: realCategory.category.id,
      saleUnit: "UNIT",
      barcodes: ["7791234567890"],
    });
    if (realProduct.kind !== "created") throw new Error("test setup: real product collided");
    const priceListId = await branchPriceListIdOf(db, bootstrapAdmin.locationId);
    const realPrice = await setPrice(db, {
      productId: realProduct.product.id,
      priceListId,
      unitPrice: 150_000,
      expectedCurrentPriceId: null,
      actorId: bootstrapAdmin.id,
      now: () => NOW,
    });
    if (realPrice.kind !== "applied") throw new Error("test setup: real price failed");
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const review = await confirmPrice(db, {
      productId: realProduct.product.id,
      priceListId,
      expectedCurrentPriceId: realPrice.price.id,
      actorId: await userIdByEmail(db, SAMPLE_ADMINISTRATOR.email),
      now: () => NOW,
    });
    if (review.kind !== "confirmed") throw new Error("test setup: real price review failed");
    const beforeClear = await sampleDataSnapshot(db);

    const outcome = await clearSampleData(db);

    expect(outcome.kind).toBe("refused");
    expect(await sampleDataSnapshot(db)).toEqual(beforeClear);
  }, 120_000);

  it("refuses and deletes nothing when no active Administrator would be left", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    await db.update(users).set({ active: false }).where(eq(users.id, bootstrapAdmin.id));
    const beforeClear = await sampleDataSnapshot(db);

    const outcome = await clearSampleData(db);

    expect(outcome.kind).toBe("refused");
    expect(await sampleDataSnapshot(db)).toEqual(beforeClear);
  }, 120_000);
  it("leaves branch settings that were changed after loading untouched", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    await db.update(branchSettings).set({ address: "Calle Real 1" });
    const [loadedSettings] = await db.select().from(branchSettings);
    const loadedHoursCount = await tableCount(db, "branch_hours");

    expect((await clearSampleData(db)).kind).toBe("cleared");

    const [settingsRow] = await db.select().from(branchSettings);
    expect(settingsRow).toEqual(loadedSettings);
    expect(await tableCount(db, "branch_hours")).toBe(loadedHoursCount);
  }, 120_000);
  it("reports the number of sample categories it actually deleted", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const removedLeafId = await sampleCategoryIdByPath(
      db,
      "Almacén",
      "Aceites y Aderezos",
      "Aceites",
    );
    const productsOfRemovedLeaf = sql`(select id from products where category_id = ${removedLeafId})`;
    await db.execute(sql`delete from audit_log where entity_id in ${productsOfRemovedLeaf}`);
    await db.execute(sql`delete from price_reviews where product_id in ${productsOfRemovedLeaf}`);
    await db.execute(sql`delete from prices where product_id in ${productsOfRemovedLeaf}`);
    await db.execute(
      sql`delete from product_barcodes where product_id in ${productsOfRemovedLeaf}`,
    );
    await db.execute(sql`alter table products disable trigger products_reject_deletion`);
    await db.execute(sql`delete from products where category_id = ${removedLeafId}`);
    await db.execute(sql`alter table products enable trigger products_reject_deletion`);
    await db.execute(sql`delete from categories where id = ${removedLeafId}`);
    const remainingCategories = await tableCount(db, "categories");

    const outcome = await clearSampleData(db);

    expect(outcome).toMatchObject({
      kind: "cleared",
      summary: { categories: remainingCategories },
    });
    expect(await tableCount(db, "categories")).toBe(0);
  }, 120_000);
});
