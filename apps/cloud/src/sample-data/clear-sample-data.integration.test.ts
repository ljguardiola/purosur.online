import { randomUUID } from "node:crypto";
import { createCategory, createProduct } from "@purosur/domain/catalog/use-cases";
import { confirmPrice, setPrice } from "@purosur/domain/pricing/use-cases";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { createRole } from "../access/role-creation-route.js";
import { createUser } from "../access/user-creation-route.js";
import { openAlert } from "../alerts/open-alert.js";
import { editBranchSettings } from "../branch/branch-settings-edit-route.js";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import {
  alerts,
  auditLog,
  branchSettings,
  categories,
  changes,
  deviceState,
  passkeyChallenges,
  prices,
  products,
  recoveryTokens,
  registerContingencyTicketKeys,
  registerInstallations,
  registerSnapshotKeys,
  registers,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { DrizzlePricingStore } from "../pricing/drizzle-pricing-store.js";
import { createRegister } from "../register/register-creation-route.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { clearSampleData } from "./clear-sample-data.js";
import { loadSampleData } from "./load-sample-data.js";
import { SAMPLE_ADMINISTRATOR, SAMPLE_BRANCH_SETTINGS, sampleEmail } from "./sample-catalog.js";

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

// `version` counts edits, so loading and then clearing advances it even when the settings end
// exactly where they started.
const SNAPSHOT_EXCLUDED_COLUMNS: Record<string, string> = { branch_settings: "version" };

async function sampleDataSnapshot(
  db: PostgresJsDatabase<Record<string, never>>,
): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  for (const tableName of [
    "users",
    "user_roles",
    "roles",
    "role_permissions",
    "sessions",
    "passkeys",
    "recovery_tokens",
    "categories",
    "products",
    "product_barcodes",
    "prices",
    "price_reviews",
    "registers",
    "register_enrollment_codes",
    "alerts",
    "alert_deliveries",
    "audit_log",
    "branch_settings",
    "branch_hours",
  ]) {
    const excluded = SNAPSHOT_EXCLUDED_COLUMNS[tableName] ?? "";
    const [row] = await db.execute<{ rows: unknown }>(
      sql.raw(
        `select coalesce(jsonb_agg(to_jsonb(t) - '${excluded}' order by (to_jsonb(t) - '${excluded}')::text), '[]'::jsonb) as rows from "${tableName}" t`,
      ),
    );
    snapshot[tableName] = (row as unknown as { rows: unknown }).rows;
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

async function editBranchSettingsAs(
  db: PostgresJsDatabase<Record<string, never>>,
  locationId: string,
  actorId: string,
  address: string,
): Promise<void> {
  const [current] = await db
    .select({ version: branchSettings.version })
    .from(branchSettings)
    .where(eq(branchSettings.locationId, locationId));
  if (!current) throw new Error("test setup: no branch settings seeded");
  const edit = await editBranchSettings(db, {
    ...SAMPLE_BRANCH_SETTINGS,
    address,
    locationId,
    actorId,
    version: current.version,
  });
  if (edit.kind !== "applied") throw new Error("test setup: editing the branch settings failed");
}

function pricingPorts(db: PostgresJsDatabase<Record<string, never>>) {
  return { store: new DrizzlePricingStore(db), clock: { now: () => NOW } };
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
    const realUserOutcome = await createUser(
      db,
      {
        firstName: "Usuaria Real",
        email: "cajera.real@example.com",
        roleId: realRoleOutcome.role.id,
        locationId: bootstrapAdmin.locationId,
        actorId: bootstrapAdmin.id,
      },
      { now: () => new Date() },
    );
    if (realUserOutcome.kind !== "created") throw new Error("test setup: real user collided");

    const realCategoryOutcome = await createCategory(new DrizzleCatalogStore(db), {
      name: "Categoría Real",
      parentId: null,
    });
    if (realCategoryOutcome.kind !== "created")
      throw new Error("test setup: real category collided");
    const realProductOutcome = await createProduct(new DrizzleCatalogStore(db), {
      name: "Producto Real",
      categoryId: realCategoryOutcome.category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7791234567890"],
      netContent: null,
    });
    if (realProductOutcome.kind !== "created") throw new Error("test setup: real product collided");
    const priceListRow = await db.execute<{ price_list_id: string }>(
      sql`select price_list_id from branch_settings where location_id = ${bootstrapAdmin.locationId}`,
    );
    const realPriceListId = (priceListRow as unknown as { price_list_id: string }[])[0]
      ?.price_list_id;
    if (!realPriceListId) throw new Error("test setup: no price list seeded");
    const realPriceOutcome = await setPrice(pricingPorts(db), {
      productId: realProductOutcome.product.id,
      priceListId: realPriceListId,
      unitPrice: 1000,
      expectedCurrentPriceId: null,
      actorId: bootstrapAdmin.id,
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
    const beforeLoad = await sampleDataSnapshot(db);

    const loadOutcome = await loadSampleData(db, { now: () => NOW });
    expect(loadOutcome.kind).toBe("loaded");

    const clearOutcome = await clearSampleData(db);
    expect(clearOutcome.kind).toBe("cleared");

    expect(await sampleDataSnapshot(db)).toEqual(beforeLoad);
  }, 120_000);
  it("leaves a real category that shares a sample category's name under another parent untouched, with its products", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    const realTop = await createCategory(new DrizzleCatalogStore(db), {
      name: "Categoría Real",
      parentId: null,
    });
    if (realTop.kind !== "created") throw new Error("test setup: real category collided");
    const realNamesake = await createCategory(new DrizzleCatalogStore(db), {
      name: "Aceites",
      parentId: realTop.category.id,
    });
    if (realNamesake.kind !== "created") throw new Error("test setup: real namesake collided");
    const realProduct = await createProduct(new DrizzleCatalogStore(db), {
      name: "Aceite Real",
      categoryId: realNamesake.category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7791234567890"],
      netContent: null,
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
    const realProduct = await createProduct(new DrizzleCatalogStore(db), {
      name: "Aceite Real",
      categoryId: sampleLeafId,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7791234567890"],
      netContent: null,
    });
    if (realProduct.kind !== "created") throw new Error("test setup: real product collided");
    const beforeClear = await sampleDataSnapshot(db);

    const outcome = await clearSampleData(db);

    expect(outcome.kind).toBe("refused");
    expect(await sampleDataSnapshot(db)).toEqual(beforeClear);
  }, 120_000);
  it("refuses and deletes nothing when a real category sits inside a sample category", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const sampleMidRows = await db.execute<{ id: string }>(
      sql`select mid.id from categories mid
          join categories top on top.id = mid.parent_id
          where top.parent_id is null and top.name = 'Almacén' and mid.name = 'Aceites y Aderezos'`,
    );
    const sampleMidId = (sampleMidRows as unknown as { id: string }[])[0]?.id;
    if (!sampleMidId)
      throw new Error("test setup: no sample category Almacén > Aceites y Aderezos");
    const realCategory = await createCategory(new DrizzleCatalogStore(db), {
      name: "Categoría Real",
      parentId: sampleMidId,
    });
    if (realCategory.kind !== "created") throw new Error("test setup: real category collided");
    const beforeClear = await sampleDataSnapshot(db);

    const outcome = await clearSampleData(db);

    expect(outcome).toEqual({
      kind: "refused",
      detail: expect.stringContaining('category "Categoría Real"'),
    });
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

  it("clears a sample register that an installation enrolled, with that installation", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const [sampleRegister] = await db.select({ id: registers.id }).from(registers).limit(1);
    if (!sampleRegister) throw new Error("test setup: no sample register was loaded");
    const [installation] = await db
      .insert(registerInstallations)
      .values({
        registerId: sampleRegister.id,
        tokenLookupPrefix: randomUUID(),
        tokenHash: "hash",
        tokenIssuedAt: NOW,
        hostname: "CAJA",
        windowsVersion: "Windows 11",
        enrolledAt: NOW,
      })
      .returning({ id: registerInstallations.id });
    if (!installation) throw new Error("test setup: no installation was inserted");
    await db
      .insert(deviceState)
      .values({ deviceId: installation.id, lastPullSince: 3, lastPulledAt: NOW });

    expect((await clearSampleData(db)).kind).toBe("cleared");

    expect(await tableCount(db, "registers")).toBe(0);
    expect(await tableCount(db, "register_installations")).toBe(0);
    expect(await tableCount(db, "device_state")).toBe(0);
  }, 120_000);

  it("logs every category, product and price it removes as a delete of the version after its last one", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const removedCategories = await db
      .select({ id: categories.id, version: categories.version })
      .from(categories);
    const removedProducts = await db
      .select({ id: products.id, version: products.version })
      .from(products);
    const removedPrices = await db
      .select({ id: prices.id, priceListId: prices.priceListId })
      .from(prices);
    expect(removedProducts.some((product) => product.version > 1)).toBe(true);

    expect((await clearSampleData(db)).kind).toBe("cleared");

    const deletes = await db
      .select({
        entity: changes.entity,
        entityId: changes.entityId,
        version: changes.version,
        priceListId: changes.priceListId,
      })
      .from(changes)
      .where(eq(changes.op, "delete"));
    const byKey = (row: { entity: string; entityId: string }) => `${row.entity}:${row.entityId}`;
    expect(deletes.map(byKey).sort()).toEqual(
      [
        ...removedCategories.map((row) => `category:${row.id}`),
        ...removedProducts.map((row) => `product:${row.id}`),
        ...removedPrices.map((row) => `price:${row.id}`),
      ].sort(),
    );
    const deleteOf = (entity: string, id: string) =>
      deletes.find((row) => row.entity === entity && row.entityId === id);
    for (const category of removedCategories) {
      expect(deleteOf("category", category.id)).toMatchObject({ version: category.version + 1 });
    }
    for (const product of removedProducts) {
      expect(deleteOf("product", product.id)).toMatchObject({ version: product.version + 1 });
    }
    for (const price of removedPrices) {
      expect(deleteOf("price", price.id)).toMatchObject({
        version: 2,
        priceListId: price.priceListId,
      });
    }
  }, 120_000);

  it("logs nothing about a real category, product or price it leaves in place", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    const realCategory = await createCategory(new DrizzleCatalogStore(db), {
      name: "Categoría Real",
      parentId: null,
    });
    if (realCategory.kind !== "created") throw new Error("test setup: real category collided");
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");

    expect((await clearSampleData(db)).kind).toBe("cleared");

    const deletes = await db
      .select({ entityId: changes.entityId })
      .from(changes)
      .where(eq(changes.op, "delete"));
    expect(deletes.map((row) => row.entityId)).not.toContain(realCategory.category.id);
  }, 120_000);

  it("logs the branch settings it set back as a change, so registers pull them", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");

    expect((await clearSampleData(db)).kind).toBe("cleared");

    const [settings] = await db
      .select({ version: branchSettings.version })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, bootstrapAdmin.locationId));
    const [lastChange] = await db
      .select({ entity: changes.entity, version: changes.version, op: changes.op })
      .from(changes)
      .where(eq(changes.entityId, bootstrapAdmin.locationId))
      .orderBy(desc(changes.changeSeq))
      .limit(1);
    expect(lastChange).toEqual({
      entity: "branch_settings",
      version: settings?.version,
      op: "update",
    });
  }, 120_000);

  it("clears a sample register that was handed its keys, with those keys", async () => {
    const db = await freshOwnerDatabase();
    await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const [sampleRegister] = await db.select({ id: registers.id }).from(registers).limit(1);
    if (!sampleRegister) throw new Error("test setup: no sample register was loaded");
    await db
      .insert(registerSnapshotKeys)
      .values({ registerId: sampleRegister.id, version: 1, key: "snapshot" });
    await db
      .insert(registerContingencyTicketKeys)
      .values({ registerId: sampleRegister.id, version: 1, key: "ticket" });

    expect((await clearSampleData(db)).kind).toBe("cleared");

    expect(await tableCount(db, "registers")).toBe(0);
    expect(await tableCount(db, "register_snapshot_keys")).toBe(0);
    expect(await tableCount(db, "register_contingency_ticket_keys")).toBe(0);
  }, 120_000);

  it("refuses and deletes nothing when a sample user reviewed a real product's price", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    const realCategory = await createCategory(new DrizzleCatalogStore(db), {
      name: "Categoría Real",
      parentId: null,
    });
    if (realCategory.kind !== "created") throw new Error("test setup: real category collided");
    const realProduct = await createProduct(new DrizzleCatalogStore(db), {
      name: "Producto Real",
      categoryId: realCategory.category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7791234567890"],
      netContent: null,
    });
    if (realProduct.kind !== "created") throw new Error("test setup: real product collided");
    const priceListId = await branchPriceListIdOf(db, bootstrapAdmin.locationId);
    const realPrice = await setPrice(pricingPorts(db), {
      productId: realProduct.product.id,
      priceListId,
      unitPrice: 150_000,
      expectedCurrentPriceId: null,
      actorId: bootstrapAdmin.id,
    });
    if (realPrice.kind !== "applied") throw new Error("test setup: real price failed");
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const review = await confirmPrice(pricingPorts(db), {
      productId: realProduct.product.id,
      priceListId,
      expectedCurrentPriceId: realPrice.price.id,
      actorId: await userIdByEmail(db, SAMPLE_ADMINISTRATOR.email),
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
  it("clears after a real administrator changed the branch settings, keeping those settings and their audit row", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const [loadedSettings] = await db
      .select({ version: branchSettings.version })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, bootstrapAdmin.locationId));
    if (!loadedSettings) throw new Error("test setup: no branch settings seeded");
    const edit = await editBranchSettings(db, {
      ...SAMPLE_BRANCH_SETTINGS,
      address: "Calle Real 1",
      locationId: bootstrapAdmin.locationId,
      actorId: bootstrapAdmin.id,
      version: loadedSettings.version,
    });
    if (edit.kind !== "applied") throw new Error("test setup: editing the branch settings failed");
    const [editedSettings] = await db.select().from(branchSettings);
    const editedHoursCount = await tableCount(db, "branch_hours");

    expect((await clearSampleData(db)).kind).toBe("cleared");

    const survivingUsers = await db.select({ id: users.id }).from(users);
    expect(survivingUsers).toEqual([{ id: bootstrapAdmin.id }]);
    const survivingSettingsAudit = await db
      .select({ actorId: auditLog.actorId, newValue: auditLog.newValue })
      .from(auditLog)
      .where(eq(auditLog.entity, "branch_settings"));
    expect(survivingSettingsAudit).toEqual([
      {
        actorId: bootstrapAdmin.id,
        newValue: expect.objectContaining({ address: "Calle Real 1" }),
      },
    ]);
    const [settingsRow] = await db.select().from(branchSettings);
    expect(settingsRow).toEqual(editedSettings);
    expect(await tableCount(db, "branch_hours")).toBe(editedHoursCount);
  }, 120_000);
  it("keeps branch settings a real administrator had already set to the sample values before loading", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    const [initialSettings] = await db
      .select({ version: branchSettings.version })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, bootstrapAdmin.locationId));
    if (!initialSettings) throw new Error("test setup: no branch settings seeded");
    const edit = await editBranchSettings(db, {
      ...SAMPLE_BRANCH_SETTINGS,
      locationId: bootstrapAdmin.locationId,
      actorId: bootstrapAdmin.id,
      version: initialSettings.version,
    });
    if (edit.kind !== "applied") throw new Error("test setup: editing the branch settings failed");
    const [realSettings] = await db.select().from(branchSettings);
    const realHoursCount = await tableCount(db, "branch_hours");
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");

    expect((await clearSampleData(db)).kind).toBe("cleared");

    const [settingsRow] = await db.select().from(branchSettings);
    expect(settingsRow).toEqual(realSettings);
    expect(await tableCount(db, "branch_hours")).toBe(realHoursCount);
  }, 120_000);

  it("keeps branch settings a real administrator set back to the sample values after loading, with their audit rows", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const editAsRealAdministrator = async (address: string) => {
      const [current] = await db
        .select({ version: branchSettings.version })
        .from(branchSettings)
        .where(eq(branchSettings.locationId, bootstrapAdmin.locationId));
      if (!current) throw new Error("test setup: no branch settings seeded");
      const edit = await editBranchSettings(db, {
        ...SAMPLE_BRANCH_SETTINGS,
        address,
        locationId: bootstrapAdmin.locationId,
        actorId: bootstrapAdmin.id,
        version: current.version,
      });
      if (edit.kind !== "applied")
        throw new Error("test setup: editing the branch settings failed");
    };
    await editAsRealAdministrator("Calle Real 1");
    await editAsRealAdministrator(SAMPLE_BRANCH_SETTINGS.address);
    const [realSettings] = await db.select().from(branchSettings);
    const realHoursCount = await tableCount(db, "branch_hours");

    expect((await clearSampleData(db)).kind).toBe("cleared");

    const [settingsRow] = await db.select().from(branchSettings);
    expect(settingsRow).toEqual(realSettings);
    expect(await tableCount(db, "branch_hours")).toBe(realHoursCount);
    const survivingSettingsAudit = await db
      .select({ actorId: auditLog.actorId })
      .from(auditLog)
      .where(eq(auditLog.entity, "branch_settings"));
    expect(survivingSettingsAudit).toEqual([
      { actorId: bootstrapAdmin.id },
      { actorId: bootstrapAdmin.id },
    ]);
  }, 120_000);

  it("refuses and deletes nothing when the sample administrator set the branch settings back to the sample values after a real edit", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const sampleAdministratorId = await userIdByEmail(db, SAMPLE_ADMINISTRATOR.email);
    await editBranchSettingsAs(db, bootstrapAdmin.locationId, bootstrapAdmin.id, "Calle Real 1");
    await editBranchSettingsAs(
      db,
      bootstrapAdmin.locationId,
      sampleAdministratorId,
      SAMPLE_BRANCH_SETTINGS.address,
    );
    const beforeClear = await sampleDataSnapshot(db);

    const outcome = await clearSampleData(db);

    expect(outcome.kind).toBe("refused");
    expect(await sampleDataSnapshot(db)).toEqual(beforeClear);
  }, 120_000);

  it("refuses and deletes nothing when the sample administrator set the sample values on branch settings the load had left alone", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    await editBranchSettingsAs(db, bootstrapAdmin.locationId, bootstrapAdmin.id, "Calle Real 1");
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    await editBranchSettingsAs(
      db,
      bootstrapAdmin.locationId,
      await userIdByEmail(db, SAMPLE_ADMINISTRATOR.email),
      SAMPLE_BRANCH_SETTINGS.address,
    );
    const beforeClear = await sampleDataSnapshot(db);

    const outcome = await clearSampleData(db);

    expect(outcome.kind).toBe("refused");
    expect(await sampleDataSnapshot(db)).toEqual(beforeClear);
  }, 120_000);

  it("refuses and deletes nothing when a sample user changed the branch settings after loading", async () => {
    const db = await freshOwnerDatabase();
    const bootstrapAdmin = await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const [loadedSettings] = await db
      .select({ version: branchSettings.version })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, bootstrapAdmin.locationId));
    if (!loadedSettings) throw new Error("test setup: no branch settings seeded");
    const edit = await editBranchSettings(db, {
      ...SAMPLE_BRANCH_SETTINGS,
      address: "Calle Real 1",
      locationId: bootstrapAdmin.locationId,
      actorId: await userIdByEmail(db, SAMPLE_ADMINISTRATOR.email),
      version: loadedSettings.version,
    });
    if (edit.kind !== "applied") throw new Error("test setup: editing the branch settings failed");
    const beforeClear = await sampleDataSnapshot(db);

    const outcome = await clearSampleData(db);

    expect(outcome.kind).toBe("refused");
    expect(await sampleDataSnapshot(db)).toEqual(beforeClear);
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
