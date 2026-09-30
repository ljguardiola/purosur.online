import { randomUUID } from "node:crypto";
import { isAlertKind, isInternalBarcode, SALE_UNITS } from "@purosur/domain";
import { eq, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { ALERT_KIND_CATALOG, alertKindDefinition } from "../alerts/alert-kind-catalog.js";
import {
  alerts,
  branchHours,
  branchSettings,
  categories,
  changes,
  discounts,
  priceReviews,
  prices,
  productBarcodes,
  products,
  productTags,
  registers,
  roles,
  tags,
  userRoles,
  users,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { loadSampleData } from "./load-sample-data.js";
import {
  SAMPLE_ADMINISTRATOR,
  SAMPLE_DISCOUNTS,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_REGISTER_NAMES,
  SAMPLE_ROLES,
  SAMPLE_TAGS,
  sampleDiscountWindow,
} from "./sample-catalog.js";

const PRODUCIBLE_ALERT_LEVELS = new Set(
  ALERT_KIND_CATALOG.flatMap((definition) =>
    definition.escalatesAfterMs === null ? [definition.level] : [definition.level, "critical"],
  ),
);

const NOW = new Date("2026-03-15T12:00:00.000Z");

let integrationDb: IntegrationDatabase | undefined;

afterEach(async () => {
  await integrationDb?.close();
  integrationDb = undefined;
});

async function freshDatabase(): Promise<PostgresJsDatabase<Record<string, never>>> {
  integrationDb = await createIntegrationDatabase("sample_data_load");
  return drizzle(postgres(integrationDb.databaseUrl, { max: 5 }));
}

async function seedActiveAdministrator(
  db: PostgresJsDatabase<Record<string, never>>,
): Promise<string> {
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
  return administrator.id;
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

describe("loadSampleData", () => {
  it("refuses when there is no active administrator, and writes nothing", async () => {
    const db = await freshDatabase();

    const outcome = await loadSampleData(db, { now: () => NOW });

    expect(outcome).toEqual({ kind: "no_administrator" });
    expect(await tableCount(db, "users")).toBe(0);
    expect(await tableCount(db, "categories")).toBe(0);
    expect(await tableCount(db, "products")).toBe(0);
  });

  it("refuses on a role-name collision and rolls the whole load back, leaving only the pre-existing administrator and the colliding role", async () => {
    const db = await freshDatabase();
    await seedActiveAdministrator(db);
    const collidingRoleName = SAMPLE_ROLES[0]?.name;
    if (!collidingRoleName) {
      throw new Error("test setup: SAMPLE_ROLES is empty");
    }
    await db.insert(roles).values({ name: collidingRoleName, isAdministrator: false });

    const outcome = await loadSampleData(db, { now: () => NOW });

    expect(outcome.kind).toBe("collision");
    expect(await tableCount(db, "users")).toBe(1);
    expect(await tableCount(db, "roles")).toBe(2);
    expect(await tableCount(db, "categories")).toBe(0);
    expect(await tableCount(db, "products")).toBe(0);
  });

  it("loads users, roles, a category tree, products, prices, registers, branch settings and open and closed alerts of every level the alert catalog produces, and a second run changes nothing", async () => {
    const db = await freshDatabase();
    await seedActiveAdministrator(db);

    const firstOutcome = await loadSampleData(db, { now: () => NOW });
    expect(firstOutcome.kind).toBe("loaded");
    if (firstOutcome.kind !== "loaded") {
      throw new Error("unreachable");
    }
    expect(firstOutcome.summary.products).toBeGreaterThanOrEqual(250);

    const sampleUsers = await db
      .select({ id: users.id, active: users.active })
      .from(users)
      .where(sql`${users.email} like ${`%@${SAMPLE_EMAIL_DOMAIN}`}`);
    expect(sampleUsers.length).toBe(firstOutcome.summary.users);
    expect(sampleUsers.some((user) => user.active)).toBe(true);
    expect(sampleUsers.some((user) => !user.active)).toBe(true);

    const sampleRoles = await db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.isAdministrator, false));
    for (const rolePlan of SAMPLE_ROLES) {
      expect(sampleRoles.some((role) => role.name === rolePlan.name)).toBe(true);
    }

    expect(await tableCount(db, "categories")).toBe(firstOutcome.summary.categories);
    const topLevelCategories = await db
      .select()
      .from(categories)
      .where(sql`${categories.parentId} is null`);
    expect(topLevelCategories.length).toBe(4);

    const allProducts = await db.select().from(products);
    expect(allProducts.length).toBe(firstOutcome.summary.products);
    expect(new Set(allProducts.map((product) => product.saleUnit))).toEqual(new Set(SALE_UNITS));
    expect(allProducts.some((product) => !product.active)).toBe(true);
    expect(allProducts.some((product) => product.active)).toBe(true);

    const storedTags = await db.select({ name: tags.name, active: tags.active }).from(tags);
    expect([...storedTags].sort((a, b) => a.name.localeCompare(b.name))).toEqual(
      [...SAMPLE_TAGS].sort((a, b) => a.name.localeCompare(b.name)),
    );
    const assignments = await db.select().from(productTags);
    const tagCountByProduct = new Map<string, number>();
    for (const row of assignments) {
      tagCountByProduct.set(row.productId, (tagCountByProduct.get(row.productId) ?? 0) + 1);
    }
    expect(tagCountByProduct.size).toBeGreaterThan(0);
    expect(tagCountByProduct.size).toBeLessThan(allProducts.length);
    expect(Math.max(...tagCountByProduct.values())).toBeGreaterThan(1);

    const storedDiscounts = await db
      .select({
        name: discounts.name,
        percent: discounts.percent,
        validFrom: discounts.validFrom,
        validTo: discounts.validTo,
        weekdays: discounts.weekdays,
        active: discounts.active,
        targetName: sql<string>`coalesce(${products.name}, ${categories.name}, ${tags.name})`,
      })
      .from(discounts)
      .leftJoin(products, eq(products.id, discounts.productId))
      .leftJoin(categories, eq(categories.id, discounts.categoryId))
      .leftJoin(tags, eq(tags.id, discounts.tagId));
    expect(storedDiscounts.map(({ name }) => name).sort()).toEqual(
      SAMPLE_DISCOUNTS.map(({ name }) => name).sort(),
    );
    for (const plan of SAMPLE_DISCOUNTS) {
      expect(storedDiscounts.find(({ name }) => name === plan.name)).toEqual({
        name: plan.name,
        percent: plan.percent,
        ...sampleDiscountWindow(plan, "2026-03-15"),
        weekdays: plan.weekdays,
        active: true,
        targetName: plan.target.name,
      });
    }

    const allBarcodes = await db.select({ code: productBarcodes.code }).from(productBarcodes);
    expect(allBarcodes.some((barcode) => barcode.code.startsWith("04"))).toBe(true);
    expect(allBarcodes.some((barcode) => isInternalBarcode(barcode.code))).toBe(true);

    const reviewCountsByProduct = await db
      .select({ productId: priceReviews.productId, reviewCount: sql<number>`count(*)::int` })
      .from(priceReviews)
      .groupBy(priceReviews.productId);
    expect(reviewCountsByProduct.some((row) => Number(row.reviewCount) === 1)).toBe(true);
    expect(reviewCountsByProduct.some((row) => Number(row.reviewCount) >= 2)).toBe(true);

    const registerRows = await db.select({ name: registers.name }).from(registers);
    expect(registerRows.map((row) => row.name).sort()).toEqual([...SAMPLE_REGISTER_NAMES].sort());

    const [settingsRow] = await db.select().from(branchSettings);
    if (!settingsRow) {
      throw new Error("test setup: branch settings row is missing");
    }
    expect(settingsRow.address).not.toBe("");
    expect(settingsRow.whatsappNumber).not.toBe("");
    expect(settingsRow.instagramHandle).not.toBe("");

    const mondayHours = await db.select().from(branchHours).where(eq(branchHours.dayOfWeek, 1));
    expect(mondayHours.length).toBe(2);
    const sundayHours = await db.select().from(branchHours).where(eq(branchHours.dayOfWeek, 7));
    expect(sundayHours.length).toBe(0);

    const alertRows = await db.select().from(alerts);
    for (const level of PRODUCIBLE_ALERT_LEVELS) {
      const ofLevel = alertRows.filter((alert) => alert.level === level);
      expect(ofLevel.some((alert) => alert.resolvedAt === null)).toBe(true);
      expect(ofLevel.some((alert) => alert.resolvedAt !== null)).toBe(true);
    }

    const beforeSecondRun = {
      users: await tableCount(db, "users"),
      roles: await tableCount(db, "roles"),
      categories: await tableCount(db, "categories"),
      products: await tableCount(db, "products"),
      productBarcodes: await tableCount(db, "product_barcodes"),
      discounts: await tableCount(db, "discounts"),
      tags: await tableCount(db, "tags"),
      productTags: await tableCount(db, "product_tags"),
      prices: await tableCount(db, "prices"),
      priceReviews: await tableCount(db, "price_reviews"),
      registers: await tableCount(db, "registers"),
      alerts: await tableCount(db, "alerts"),
      alertDeliveries: await tableCount(db, "alert_deliveries"),
    };

    const secondOutcome = await loadSampleData(db, {
      now: () => new Date(NOW.getTime() + 3_600_000),
    });
    expect(secondOutcome).toEqual({ kind: "already_loaded" });

    expect({
      users: await tableCount(db, "users"),
      roles: await tableCount(db, "roles"),
      categories: await tableCount(db, "categories"),
      products: await tableCount(db, "products"),
      productBarcodes: await tableCount(db, "product_barcodes"),
      discounts: await tableCount(db, "discounts"),
      tags: await tableCount(db, "tags"),
      productTags: await tableCount(db, "product_tags"),
      prices: await tableCount(db, "prices"),
      priceReviews: await tableCount(db, "price_reviews"),
      registers: await tableCount(db, "registers"),
      alerts: await tableCount(db, "alerts"),
      alertDeliveries: await tableCount(db, "alert_deliveries"),
    }).toEqual(beforeSecondRun);
  }, 120_000);
  it("logs every category, product and price it loads as an insert, each price with its price list, and every deactivation as an update", async () => {
    const db = await freshDatabase();
    await seedActiveAdministrator(db);

    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");

    const logged = await db
      .select({
        entity: changes.entity,
        entityId: changes.entityId,
        version: changes.version,
        op: changes.op,
        priceListId: changes.priceListId,
      })
      .from(changes);
    const latestLogged = (entity: string, entityId: string) =>
      logged
        .filter((change) => change.entity === entity && change.entityId === entityId)
        .sort((a, b) => a.version - b.version)
        .at(-1);
    const loadedCategories = await db
      .select({ id: categories.id, version: categories.version })
      .from(categories);
    const loadedProducts = await db
      .select({ id: products.id, version: products.version })
      .from(products);
    const loadedTags = await db.select({ id: tags.id, version: tags.version }).from(tags);
    expect(loadedTags.length).toBeGreaterThan(0);
    const loadedPrices = await db
      .select({ id: prices.id, priceListId: prices.priceListId })
      .from(prices);
    expect(loadedCategories.length).toBeGreaterThan(0);
    expect(loadedProducts.length).toBeGreaterThan(0);
    expect(loadedPrices.length).toBeGreaterThan(0);

    for (const category of loadedCategories) {
      expect(latestLogged("category", category.id)).toMatchObject({ version: category.version });
    }
    for (const product of loadedProducts) {
      expect(latestLogged("product", product.id)).toMatchObject({
        version: product.version,
        op: product.version === 1 ? "insert" : "update",
      });
    }
    for (const tag of loadedTags) {
      expect(latestLogged("tag", tag.id)).toMatchObject({ version: tag.version });
    }
    for (const price of loadedPrices) {
      expect(latestLogged("price", price.id)).toMatchObject({
        version: 1,
        op: "insert",
        priceListId: price.priceListId,
      });
    }
    expect(loadedProducts.some((product) => product.version > 1)).toBe(true);
  }, 120_000);

  it("logs every user it loads with its branch and every role it loads, the deactivated users as an update", async () => {
    const db = await freshDatabase();
    await seedActiveAdministrator(db);

    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");

    const logged = await db
      .select({
        entity: changes.entity,
        entityId: changes.entityId,
        version: changes.version,
        op: changes.op,
        locationId: changes.locationId,
      })
      .from(changes);
    const latestLogged = (entity: string, entityId: string) =>
      logged
        .filter((change) => change.entity === entity && change.entityId === entityId)
        .sort((a, b) => a.version - b.version)
        .at(-1);
    const loadedUsers = await db
      .select({ id: users.id, version: users.version, locationId: users.locationId })
      .from(users)
      .where(sql`${users.email} like ${`%@${SAMPLE_EMAIL_DOMAIN}`}`);
    const loadedRoles = await db
      .select({ id: roles.id, version: roles.version })
      .from(roles)
      .where(eq(roles.isAdministrator, false));
    expect(loadedUsers.length).toBeGreaterThan(0);
    expect(loadedUsers.some((user) => user.version > 1)).toBe(true);
    expect(loadedRoles.length).toBeGreaterThan(0);

    for (const user of loadedUsers) {
      expect(latestLogged("user", user.id)).toMatchObject({
        version: user.version,
        op: user.version === 1 ? "insert" : "update",
        locationId: user.locationId,
      });
    }
    for (const role of loadedRoles) {
      expect(latestLogged("role", role.id)).toMatchObject({
        version: role.version,
        op: "insert",
        locationId: null,
      });
    }
  }, 120_000);

  it("logs every register it loads as an insert at its version, scoped to no branch", async () => {
    const db = await freshDatabase();
    await seedActiveAdministrator(db);

    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");

    const loadedRegisters = await db
      .select({ id: registers.id, version: registers.version })
      .from(registers);
    const logged = await db
      .select({
        entityId: changes.entityId,
        version: changes.version,
        op: changes.op,
        locationId: changes.locationId,
      })
      .from(changes)
      .where(eq(changes.entity, "register"));
    expect(loadedRegisters).toHaveLength(SAMPLE_REGISTER_NAMES.length);
    expect(logged.map((row) => row.entityId).sort()).toEqual(
      loadedRegisters.map((register) => register.id).sort(),
    );
    for (const register of loadedRegisters) {
      expect(logged.find((row) => row.entityId === register.id)).toMatchObject({
        version: register.version,
        op: "insert",
        locationId: null,
      });
    }
  }, 120_000);

  it("leaves branch settings that were already configured untouched", async () => {
    const db = await freshDatabase();
    await seedActiveAdministrator(db);
    await db.update(branchSettings).set({ address: "Calle Real 1" });

    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");

    const [settingsRow] = await db.select().from(branchSettings);
    expect(settingsRow).toMatchObject({
      address: "Calle Real 1",
      whatsappNumber: "",
      instagramHandle: "",
    });
    expect(await tableCount(db, "branch_hours")).toBe(0);
  }, 120_000);

  it("leaves branch hours that were already configured untouched", async () => {
    const db = await freshDatabase();
    await seedActiveAdministrator(db);
    const locationId = await seededLocationId(db);
    await db
      .insert(branchHours)
      .values({ locationId, dayOfWeek: 3, position: 0, opensAt: "10:00", closesAt: "18:00" });

    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");

    const [settingsRow] = await db.select().from(branchSettings);
    expect(settingsRow).toMatchObject({ address: "", whatsappNumber: "", instagramHandle: "" });
    const hoursRows = await db
      .select({ dayOfWeek: branchHours.dayOfWeek, opensAt: branchHours.opensAt })
      .from(branchHours);
    expect(hoursRows).toEqual([{ dayOfWeek: 3, opensAt: "10:00:00" }]);
  }, 120_000);
  it("writes every sample alert with a catalog kind, the level that kind reaches, and the detail shape its real producer writes", async () => {
    const db = await freshDatabase();
    const bootstrapAdministratorId = await seedActiveAdministrator(db);
    expect((await loadSampleData(db, { now: () => NOW })).kind).toBe("loaded");
    const [sampleAdministrator] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, SAMPLE_ADMINISTRATOR.email));

    const alertRows = await db.select().from(alerts);

    for (const alert of alertRows) {
      if (!isAlertKind(alert.kind)) {
        throw new Error(`alert kind ${alert.kind} is not in the alert catalog`);
      }
      const definition = alertKindDefinition(alert.kind);
      const escalated = alert.escalatedAt !== null && definition.escalatesAfterMs !== null;
      expect(alert.level).toBe(escalated ? "critical" : definition.level);
    }
    const lockoutAlerts = alertRows.filter((alert) => alert.kind === "backoffice_sign_in_lockout");
    expect(lockoutAlerts.length).toBeGreaterThan(0);
    for (const alert of lockoutAlerts) {
      expect(alert.detail).toEqual({
        sourceAddress: expect.any(String),
        failureCount: expect.any(Number),
        blockedUntil: expect.any(String),
      });
    }
    const emailChangedAlerts = alertRows.filter((alert) => alert.kind === "user_email_changed");
    expect(emailChangedAlerts.length).toBeGreaterThan(0);
    for (const alert of emailChangedAlerts) {
      expect(alert.detail).toEqual({
        previousEmail: expect.any(String),
        newEmail: expect.any(String),
        actorId: sampleAdministrator?.id,
      });
    }
    const accessIncreasedAlerts = alertRows.filter(
      (alert) => alert.kind === "user_access_increased",
    );
    expect(accessIncreasedAlerts.map((alert) => [alert.scope, alert.detail])).toEqual([
      [
        sampleAdministrator?.id,
        { cause: "created_as_administrator", actorId: bootstrapAdministratorId },
      ],
    ]);
  }, 120_000);
});
