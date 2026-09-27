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
  products,
  registers,
  roles,
  userRoles,
  users,
} from "../db/schema.js";
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
});
