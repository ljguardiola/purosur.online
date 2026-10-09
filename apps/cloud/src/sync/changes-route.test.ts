import { changesPageSchema, cloudErrorSchema } from "@purosur/contracts";
import { pullAudienceOf } from "@purosur/domain";
import { editBranchSettings } from "@purosur/domain/branch/use-cases";
import {
  createCategory,
  createProduct,
  createTag,
  deactivateProduct,
  deactivateTag,
  editProduct,
} from "@purosur/domain/catalog/use-cases";
import { createRole } from "@purosur/domain/permissions/use-cases";
import { createDiscount, editDiscount, setPrice } from "@purosur/domain/pricing/use-cases";
import { createRegister } from "@purosur/domain/register/use-cases";
import { createUser, deactivateUser } from "@purosur/domain/users/use-cases";
import { eq, inArray, sql } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import { DrizzleBranchSettingsStore } from "../branch/drizzle-branch-settings-store.js";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { insertProductWithTags } from "../catalog/test-support/catalog-route-fixtures.js";
import { voidOutstandingRecoveryTokens } from "../credentials/void-outstanding-recovery-tokens.js";
import { DrizzleRoleStore } from "../permissions/drizzle-role-store.js";
import {
  branchSettings,
  buyerIdentificationThresholds,
  categories,
  changes,
  deviceState,
  discounts,
  installationRequestAttempts,
  locations,
  priceLists,
  priceReviews,
  prices,
  productBarcodes,
  products,
  registerInstallations,
  registers,
  rolePermissions,
  roles,
  tags,
  userPins,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { DrizzleDiscountStore } from "../pricing/drizzle-discount-store.js";
import { DrizzlePricingStore } from "../pricing/drizzle-pricing-store.js";
import { issueDeviceToken } from "../register/device-token.js";
import { DrizzleBranchRegisterStore } from "../register/drizzle-branch-register-store.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { DrizzleUserStore } from "../users/drizzle-user-store.js";
import { logChange } from "./change-log.js";
import { registerChangesRoute } from "./changes-route.js";
import { DrizzleChangeLog } from "./drizzle-change-log.js";
import { insertRequestsUpToLimit } from "./test-support/admitted-requests.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

const DEFAULT_SETTINGS_ROW = {
  address: "",
  whatsapp_number: "",
  instagram_handle: "",
  monday_hours: [],
  tuesday_hours: [],
  wednesday_hours: [],
  thursday_hours: [],
  friday_hours: [],
  saturday_hours: [],
  sunday_hours: [],
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 30,
  good_condition_return_days: 15,
  version: 1,
};

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  registerRouteAccess(app);
  registerChangesRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function pull(query: string, authorization?: string) {
  return app.inject({
    method: "GET",
    url: `/changes${query}`,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

async function pullPage(since: number, deviceToken: string) {
  const response = await pull(`?since=${since}`, `Bearer ${deviceToken}`);
  expect(response.statusCode).toBe(200);
  return changesPageSchema.parse(response.json());
}

async function insertLocationOnPriceList(priceListId: string): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the location returned no row");
  }
  await db.insert(branchSettings).values({ locationId: location.id, priceListId });
  return location.id;
}

async function insertOtherBranch(): Promise<string> {
  const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!otherLocation) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  await db
    .insert(branchSettings)
    .values({ locationId: otherLocation.id, priceListId: await seededPriceListId(db) });
  await db.insert(changes).values({
    entity: "branch_settings",
    entityId: otherLocation.id,
    version: 1,
    op: "insert",
  });
  return otherLocation.id;
}

async function insertActor(locationId: string): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lovelace", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

function settingsEdit(locationId: string, actorId: string, version: number, address: string) {
  return {
    locationId,
    actorId,
    address,
    whatsappNumber: "",
    instagramHandle: "",
    mondayHours: [{ opensAt: "09:00", closesAt: "13:00" }],
    tuesdayHours: [],
    wednesdayHours: [],
    thursdayHours: [],
    fridayHours: [],
    saturdayHours: [],
    sundayHours: [],
    expiringLotAlertDays: 30,
    unreviewedPriceAlertDays: 30,
    goodConditionReturnDays: 15,
    version,
  };
}

async function administratorRoleId(): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return administratorRole.id;
}

async function seededThresholdId(): Promise<string> {
  const [threshold] = await db
    .select({ id: buyerIdentificationThresholds.id })
    .from(buyerIdentificationThresholds);
  if (!threshold) {
    throw new Error("test setup: no buyer-identification threshold seeded");
  }
  return threshold.id;
}

const SEEDED_THRESHOLD_ROW = { amount: 1_000_000_000, valid_from: "2000-01-01", revision: 0 };

describe("GET /changes", () => {
  it("gives a brand-new installation its branch's settings, with their version, from the very first cursor", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });

    const page = await pullPage(0, deviceToken);

    expect(page).toEqual({
      changes: [
        {
          change_seq: 1,
          entity: "branch_settings",
          entity_id: locationId,
          row: DEFAULT_SETTINGS_ROW,
        },
        {
          change_seq: 2,
          entity: "price_list",
          entity_id: await seededPriceListId(db),
          row: { name: "Lista general", version: 1 },
        },
        {
          change_seq: 3,
          entity: "role",
          entity_id: await administratorRoleId(),
          row: { name: null, is_administrator: true, permission_keys: [], version: 1 },
        },
        {
          change_seq: 4,
          entity: "buyer_identification_threshold",
          entity_id: await seededThresholdId(),
          row: SEEDED_THRESHOLD_ROW,
        },
      ],
      cursor: 4,
      has_more: false,
    });
  });

  it("gives only the branch the token belongs to, whatever else the request names", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const otherLocationId = await insertOtherBranch();

    const response = await pull(
      `?since=0&location_id=${otherLocationId}&register_id=${otherLocationId}`,
      `Bearer ${deviceToken}`,
    );

    expect(response.statusCode).toBe(200);
    const page = changesPageSchema.parse(response.json());
    expect(page.changes.map((change) => change.entity_id)).toEqual([
      locationId,
      await seededPriceListId(db),
      await administratorRoleId(),
      await seededThresholdId(),
    ]);
  });

  it("gives nothing and keeps the cursor once the register has every change", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    expect(await pullPage(4, deviceToken)).toEqual({ changes: [], cursor: 4, has_more: false });
  });

  it("reaches a register only on its next pull after a backoffice edit, with the edited row and its new version", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const first = await pullPage(0, deviceToken);
    expect(first.cursor).toBe(4);

    await editBranchSettings(
      { store: new DrizzleBranchSettingsStore(db, () => NOW) },
      settingsEdit(locationId, await insertActor(locationId), 1, "Av. Belgrano 1450"),
    );
    const next = await pullPage(first.cursor, deviceToken);

    expect(next.changes).toEqual([
      {
        change_seq: 5,
        entity: "branch_settings",
        entity_id: locationId,
        row: {
          ...DEFAULT_SETTINGS_ROW,
          address: "Av. Belgrano 1450",
          monday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
          version: 2,
        },
      },
    ]);
    expect(next).toMatchObject({ cursor: 5, has_more: false });
  });

  it("pages more than 500 changes through, 500 at a time, until none is left", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    await db.insert(changes).values(
      Array.from({ length: 600 }, (_, index) => ({
        entity: "branch_settings",
        entityId: locationId,
        version: index + 2,
        op: "update" as const,
      })),
    );

    const first = await pullPage(0, deviceToken);
    const second = await pullPage(first.cursor, deviceToken);

    expect(first.changes).toHaveLength(500);
    expect(first).toMatchObject({ cursor: 500, has_more: true });
    expect(second.changes).toHaveLength(104);
    expect(second.changes[0]?.change_seq).toBe(501);
    expect(second).toMatchObject({ cursor: 604, has_more: false });
  });

  it("records the cursor each device last asked from and when", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    await pullPage(0, deviceToken);
    await pullPage(3, deviceToken);

    expect(
      await db
        .select({
          deviceId: deviceState.deviceId,
          lastPullSince: deviceState.lastPullSince,
          lastPulledAt: deviceState.lastPulledAt,
        })
        .from(deviceState)
        .where(eq(deviceState.deviceId, deviceId)),
    ).toEqual([{ deviceId, lastPullSince: 3, lastPulledAt: NOW }]);
  });

  it.each([
    ["no device token", undefined],
    ["a device token no installation holds", `Bearer ${issueDeviceToken().deviceToken}`],
    ["something that is not a device token", "Basic dXNlcjpwYXNz"],
  ])("refuses a request with %s, giving nothing", async (_case, authorization) => {
    await insertEnrolledInstallation(db, { now: NOW });

    const response = await pull("?since=0", authorization);

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
  });

  it("records each admitted pull as a request of its installation", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    await pull("?since=0", `Bearer ${deviceToken}`);

    expect(
      await db
        .select({ endpoint: installationRequestAttempts.endpoint })
        .from(installationRequestAttempts)
        .where(eq(installationRequestAttempts.deviceId, deviceId)),
    ).toEqual([{ endpoint: "pull" }]);
  });

  it("refuses a pull past the installation's limit with when to retry, recording no cursor", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    await insertRequestsUpToLimit(db, deviceId, "pull", new Date(NOW.getTime() - 59 * 60 * 1000));

    const response = await pull("?since=0", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(cloudErrorSchema.parse(response.json())).toEqual({
      code: "rate_limited",
      message: "too many requests",
      details: [{ retry_after_seconds: 60 }],
    });
    expect(await db.select().from(deviceState)).toEqual([]);
  });

  it("refuses a revoked installation's token, recording nothing", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      revokedAt: new Date("2026-09-29T09:00:00.000Z"),
    });

    const response = await pull("?since=0", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
    expect(await db.select().from(deviceState)).toEqual([]);
  });

  it("refuses a since that is not a cursor, naming the field", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await pull("?since=-1", `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "since" }],
    });
  });

  it("answers a failure with the cloud error envelope, revealing nothing of it", {
    timeout: 30_000,
  }, async () => {
    const broken = await buildTestDatabase();
    await broken.close();
    const failing = Fastify();
    registerRouteAccess(failing);
    registerChangesRoute(failing, {
      db: broken.db,
      now: () => NOW,
      rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    });

    const response = await failing.inject({
      method: "GET",
      url: "/changes?since=0",
      headers: { authorization: `Bearer ${issueDeviceToken().deviceToken}` },
    });
    await failing.close();

    expect(response.statusCode).toBe(500);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "internal_error" });
    expect(response.body).not.toContain("register_installations");
  });
});

describe("GET /changes carrying the catalog and the prices", () => {
  const AT = new Date("2026-09-29T09:30:00.000Z");
  const catalogStore = () => new DrizzleCatalogStore(db);

  async function newCategory(name: string, parentId: string | null = null): Promise<string> {
    const outcome = await createCategory(catalogStore(), { name, parentId });
    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating the category ended as ${outcome.kind}`);
    }
    return outcome.category.id;
  }

  async function newTag(name: string): Promise<string> {
    const outcome = await createTag(catalogStore(), { name });
    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating the tag ended as ${outcome.kind}`);
    }
    return outcome.tag.id;
  }

  async function newProduct(
    categoryId: string,
    barcodes: string[],
    name = "Arroz",
    tagIds: string[] = [],
  ) {
    const outcome = await createProduct(catalogStore(), {
      name,
      categoryId,
      brandId: null,
      saleUnit: "UNIT",
      barcodes,
      netContent: { quantity: 1, unit: "KG" },
      tagIds,
    });
    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating the product ended as ${outcome.kind}`);
    }
    return outcome.product;
  }

  async function newPrice(productId: string, locationId: string, unitPrice: number) {
    const outcome = await setPrice(
      { store: new DrizzlePricingStore(db, () => NOW), clock: { now: () => AT } },
      {
        productId,
        locationId,
        unitPrice,
        expectedCurrentPriceId: null,
        actorId: await anActor(),
      },
    );
    if (outcome.kind !== "applied") {
      throw new Error(`test setup: setting the price ended as ${outcome.kind}`);
    }
    return outcome.price;
  }

  async function anActor(): Promise<string> {
    const [existing] = await db.select({ id: users.id }).from(users).limit(1);
    if (existing) {
      return existing.id;
    }
    const [location] = await db.select({ id: locations.id }).from(locations).limit(1);
    if (!location) {
      throw new Error("test setup: no location seeded");
    }
    return insertActor(location.id);
  }

  async function insertOtherPriceList(): Promise<string> {
    const [priceList] = await db
      .insert(priceLists)
      .values({ name: "Lista mayorista" })
      .returning({ id: priceLists.id });
    if (!priceList) {
      throw new Error("test setup: seeding the other price list returned no row");
    }
    await logChange(db, {
      entity: "price_list",
      entityId: priceList.id,
      version: 1,
      op: "insert",
    });
    return priceList.id;
  }

  async function pullSinceSeeded(deviceToken: string) {
    return pullPage(4, deviceToken);
  }

  it("gives the categories, the products with their barcodes in order, and the branch's price list's prices, each with its version", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const priceListId = await seededPriceListId(db);
    const parentId = await newCategory("Almacén");
    const leafId = await newCategory("Secos", parentId);
    const tagId = await newTag("Sin TACC");
    const product = await newProduct(leafId, ["7790001000011", "7790001000028"], "Arroz", [tagId]);
    const price = await newPrice(product.id, locationId, 125050);

    const page = await pullSinceSeeded(deviceToken);

    expect(page.changes).toEqual([
      {
        change_seq: 5,
        entity: "category",
        entity_id: parentId,
        row: { name: "Almacén", parent_id: null, version: 1 },
      },
      {
        change_seq: 6,
        entity: "category",
        entity_id: leafId,
        row: { name: "Secos", parent_id: parentId, version: 1 },
      },
      {
        change_seq: 7,
        entity: "tag",
        entity_id: tagId,
        row: { name: "Sin TACC", active: true, version: 1 },
      },
      {
        change_seq: 8,
        entity: "product",
        entity_id: product.id,
        row: {
          name: "Arroz",
          category_id: leafId,
          brand_id: null,
          sale_unit: "UNIT",
          active: true,
          net_content: { quantity: 1, unit: "KG" },
          barcodes: [
            { position: 0, code: "7790001000011" },
            { position: 1, code: "7790001000028" },
          ],
          tag_ids: [tagId],
          version: 1,
        },
      },
      {
        change_seq: 9,
        entity: "price",
        entity_id: price.id,
        row: {
          product_id: product.id,
          price_list_id: priceListId,
          unit_price: 125050,
          valid_from: AT.toISOString(),
          version: 1,
        },
      },
    ]);
    expect(page).toMatchObject({ cursor: 9, has_more: false });
  });

  it("gives a deactivated tag marked inactive, at its version, and a removed tag as a removal", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const deactivatedId = await newTag("Vegano");
    const removedId = await newTag("Temporal");
    await deactivateTag(catalogStore(), deactivatedId);
    await db.delete(tags).where(eq(tags.id, removedId));
    await db
      .insert(changes)
      .values({ entity: "tag", entityId: removedId, version: 2, op: "delete" });

    const page = await pullSinceSeeded(deviceToken);

    expect(page.changes).toEqual([
      {
        change_seq: 5,
        entity: "tag",
        entity_id: deactivatedId,
        row: { name: "Vegano", active: false, version: 2 },
      },
      { change_seq: 6, entity: "removal", entity_id: removedId, removed_entity: "tag", version: 2 },
      {
        change_seq: 7,
        entity: "tag",
        entity_id: deactivatedId,
        row: { name: "Vegano", active: false, version: 2 },
      },
      { change_seq: 8, entity: "removal", entity_id: removedId, removed_entity: "tag", version: 2 },
    ]);
  });

  it("gives every change of a row the row as it is now, so a deactivated product arrives marked with the barcodes it kept", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const categoryId = await newCategory("Almacén");
    const product = await newProduct(categoryId, ["7790001000011", "7790001000028"]);
    await editProduct(
      { store: catalogStore(), clock: { now: () => new Date() } },
      {
        id: product.id,
        name: "Arroz largo fino",
        categoryId,
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["7790001000011", "7790001000028"],
        netContent: null,
        tagIds: [],
        version: 1,
      },
    );
    await deactivateProduct(catalogStore(), product.id);

    const page = await pullSinceSeeded(deviceToken);

    const productChanges = page.changes.filter((change) => change.entity === "product");
    expect(productChanges.map((change) => change.change_seq)).toEqual([6, 7, 8]);
    for (const change of productChanges) {
      expect(change).toMatchObject({
        entity_id: product.id,
        row: {
          name: "Arroz largo fino",
          active: false,
          net_content: null,
          barcodes: [
            { position: 0, code: "7790001000011" },
            { position: 1, code: "7790001000028" },
          ],
          version: 3,
        },
      });
    }
  });

  it("gives the branch's own price list but neither another list nor its prices", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const otherPriceListId = await insertOtherPriceList();
    const otherLocationId = await insertLocationOnPriceList(otherPriceListId);
    const product = await newProduct(await newCategory("Almacén"), ["7790001000011"]);
    const branchPrice = await newPrice(product.id, locationId, 1000);
    await newPrice(product.id, otherLocationId, 900);

    const page = await pullSinceSeeded(deviceToken);

    expect(page.changes.map((change) => change.entity)).toEqual(["category", "product", "price"]);
    expect(page.changes.at(-1)?.entity_id).toBe(branchPrice.id);
    expect(page.changes.map((change) => change.entity_id)).not.toContain(otherPriceListId);
  });

  it("gives a removal in place of a row that no longer exists, at the version of its latest change", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const priceListId = await seededPriceListId(db);
    const categoryId = await newCategory("Almacén");
    const emptyCategoryId = await newCategory("Vacía");
    const product = await newProduct(categoryId, ["7790001000011"]);
    const price = await newPrice(product.id, locationId, 1000);
    await db.execute(sql`alter table products disable trigger products_reject_deletion`);
    await db.delete(priceReviews).where(eq(priceReviews.priceId, price.id));
    await db.delete(prices).where(eq(prices.id, price.id));
    await db.delete(productBarcodes).where(eq(productBarcodes.productId, product.id));
    await db.delete(products).where(eq(products.id, product.id));
    await db.delete(categories).where(eq(categories.id, emptyCategoryId));
    await db.insert(changes).values([
      { entity: "price", entityId: price.id, version: 2, op: "delete", priceListId },
      { entity: "product", entityId: product.id, version: 2, op: "delete" },
      { entity: "category", entityId: emptyCategoryId, version: 2, op: "delete" },
    ]);

    const page = await pullSinceSeeded(deviceToken);

    expect(page.changes).toEqual([
      {
        change_seq: 5,
        entity: "category",
        entity_id: categoryId,
        row: { name: "Almacén", parent_id: null, version: 1 },
      },
      {
        change_seq: 6,
        entity: "removal",
        entity_id: emptyCategoryId,
        removed_entity: "category",
        version: 2,
      },
      {
        change_seq: 7,
        entity: "removal",
        entity_id: product.id,
        removed_entity: "product",
        version: 2,
      },
      {
        change_seq: 8,
        entity: "removal",
        entity_id: price.id,
        removed_entity: "price",
        version: 2,
      },
      {
        change_seq: 9,
        entity: "removal",
        entity_id: price.id,
        removed_entity: "price",
        version: 2,
      },
      {
        change_seq: 10,
        entity: "removal",
        entity_id: product.id,
        removed_entity: "product",
        version: 2,
      },
      {
        change_seq: 11,
        entity: "removal",
        entity_id: emptyCategoryId,
        removed_entity: "category",
        version: 2,
      },
    ]);
  });

  it("gives no removal of a price of another price list, even though the price is gone", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const otherPriceListId = await insertOtherPriceList();
    await db.insert(changes).values({
      entity: "price",
      entityId: "00000000-0000-4000-8000-000000000001",
      version: 2,
      op: "delete",
      priceListId: otherPriceListId,
    });

    expect(await pullSinceSeeded(deviceToken)).toEqual({
      changes: [],
      cursor: 4,
      has_more: false,
    });
  });

  it("pages catalog changes through 500 at a time, each carrying its row", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const inserted = await db
      .insert(categories)
      .values(Array.from({ length: 600 }, (_, index) => ({ name: `Categoría ${index}` })))
      .returning({ id: categories.id });
    await db.insert(changes).values(
      inserted.map(({ id }) => ({
        entity: "category",
        entityId: id,
        version: 1,
        op: "insert" as const,
      })),
    );

    const first = await pullPage(4, deviceToken);
    const second = await pullPage(first.cursor, deviceToken);

    expect(first.changes).toHaveLength(500);
    expect(first).toMatchObject({ cursor: 504, has_more: true });
    expect(second.changes).toHaveLength(100);
    expect(second).toMatchObject({ cursor: 604, has_more: false });
    expect(
      new Set([...first.changes, ...second.changes].map((change) => change.entity_id)),
    ).toEqual(new Set(inserted.map(({ id }) => id)));
    expect(second.changes.every((change) => change.entity === "category")).toBe(true);
  });
});

describe("GET /changes carrying the users and the roles", () => {
  const SEEDED_CHANGES = 4;
  const NOW_FOR_ALERTS = { now: () => NOW };

  async function newRole(name: string, permissionKeys: string[]): Promise<string> {
    const outcome = await createRole(
      { store: new DrizzleRoleStore(db, () => NOW) },
      { name, permissionKeys, actorId: await anActor() },
    );
    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating the role ended as ${outcome.kind}`);
    }
    return outcome.role.id;
  }

  async function newUser(firstName: string, email: string, roleId: string): Promise<string> {
    const outcome = await createUser(
      {
        store: new DrizzleUserStore(db, () => NOW, voidOutstandingRecoveryTokens),
        clock: NOW_FOR_ALERTS,
      },
      {
        firstName,
        email,
        roleId,
        locationId: await seededLocationId(db),
        actorId: await anActor(),
        actorMayReactivateUsers: false,
      },
    );
    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating the user ended as ${outcome.kind}`);
    }
    return outcome.user.id;
  }

  async function anActor(): Promise<string> {
    const [existing] = await db.select({ id: users.id }).from(users).limit(1);
    return existing?.id ?? (await insertActor(await seededLocationId(db)));
  }

  async function newUserOfAnotherBranch(otherLocationId: string, roleId: string): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({
        firstName: "Barbara",
        email: "barbara@example.com",
        locationId: otherLocationId,
      })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the other branch's user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId });
    await logChange(db, {
      entity: "user",
      entityId: user.id,
      version: 1,
      op: "insert",
      locationId: otherLocationId,
    });
    return user.id;
  }

  async function setPin(userId: string, locationId: string) {
    const [user] = await db
      .update(users)
      .set({ version: 2 })
      .where(eq(users.id, userId))
      .returning({ version: users.version });
    await db.insert(userPins).values({ userId, salt: "c2FsdA", hash: "aGFzaA", setAt: NOW });
    await logChange(db, {
      entity: "user",
      entityId: userId,
      version: user?.version ?? 0,
      op: "update",
      locationId,
    });
  }

  it("gives a brand-new installation the Administrator role, which grants no listed permission, from the first cursor", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const [administratorRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));

    const page = await pullPage(2, deviceToken);

    expect(page.changes).toEqual([
      {
        change_seq: 3,
        entity: "role",
        entity_id: administratorRole?.id,
        row: { name: null, is_administrator: true, permission_keys: [], version: 1 },
      },
      {
        change_seq: 4,
        entity: "buyer_identification_threshold",
        entity_id: await seededThresholdId(),
        row: SEEDED_THRESHOLD_ROW,
      },
    ]);
  });

  it("gives the branch's users with their role, salt and PIN hash and the roles with their permissions, never a user's email", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const cashierRoleId = await newRole("Cajera", ["sell_and_charge", "adjust_stock"]);
    const adaId = await newUser("Ada", "ada.l@example.com", cashierRoleId);
    const graceId = await newUser("Grace", "grace@example.com", cashierRoleId);
    await setPin(graceId, await seededLocationId(db));

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    expect(page.changes.map(({ change_seq, ...change }) => change)).toEqual([
      {
        entity: "role",
        entity_id: cashierRoleId,
        row: {
          name: "Cajera",
          is_administrator: false,
          permission_keys: ["adjust_stock", "sell_and_charge"],
          version: 1,
        },
      },
      {
        entity: "user",
        entity_id: adaId,
        row: {
          first_name: "Ada",
          role_id: cashierRoleId,
          salt: null,
          pin_hash: null,
          active: true,
          version: 1,
        },
      },
      ...[graceId, graceId].map((id) => ({
        entity: "user",
        entity_id: id,
        row: {
          first_name: "Grace",
          role_id: cashierRoleId,
          salt: "c2FsdA",
          pin_hash: "aGFzaA",
          active: true,
          version: 2,
        },
      })),
    ]);
    expect(JSON.stringify(page)).not.toContain("example.com");
  });

  it("gives a user of another branch to nobody but that branch, and every role to every branch", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const otherLocationId = await insertOtherBranch();
    const cashierRoleId = await newRole("Cajera", []);
    await newUserOfAnotherBranch(otherLocationId, cashierRoleId);

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    expect(page.changes.map((change) => change.entity)).toEqual(["role"]);
    expect(page.changes[0]?.entity_id).toBe(cashierRoleId);
  });

  it("gives a user who lost their PIN with no salt and no PIN hash, at the version of the change", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const cashierRoleId = await newRole("Cajera", []);
    const graceId = await newUser("Grace", "grace@example.com", cashierRoleId);
    await setPin(graceId, locationId);
    await db.delete(userPins).where(eq(userPins.userId, graceId));
    await db.update(users).set({ version: 3 }).where(eq(users.id, graceId));
    await logChange(db, {
      entity: "user",
      entityId: graceId,
      version: 3,
      op: "update",
      locationId,
    });

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    const last = page.changes.at(-1);
    expect(last).toMatchObject({
      entity: "user",
      entity_id: graceId,
      row: { salt: null, pin_hash: null, version: 3 },
    });
  });

  it("gives a deactivated user marked inactive, at its version", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const cashierRoleId = await newRole("Cajera", []);
    const graceId = await newUser("Grace", "grace@example.com", cashierRoleId);
    await deactivateUser(
      { store: new DrizzleUserStore(db, () => NOW, voidOutstandingRecoveryTokens) },
      { id: graceId, actorId: await anActor(), at: NOW },
    );

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    expect(page.changes.at(-1)).toMatchObject({
      entity: "user",
      entity_id: graceId,
      row: { active: false, version: 2 },
    });
  });

  it("gives a removal in place of a user or a role that no longer exists, at the version of its latest change, and none for another branch's user", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const otherLocationId = await insertOtherBranch();
    const removedRoleId = await newRole("Temporal", ["adjust_stock"]);
    const graceId = await newUser("Grace", "grace@example.com", removedRoleId);
    const barbaraId = await newUserOfAnotherBranch(otherLocationId, removedRoleId);
    await db.delete(userRoles).where(inArray(userRoles.userId, [graceId, barbaraId]));
    await db.delete(users).where(inArray(users.id, [graceId, barbaraId]));
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, removedRoleId));
    await db.delete(roles).where(eq(roles.id, removedRoleId));
    await db.insert(changes).values([
      { entity: "user", entityId: graceId, version: 2, op: "delete", locationId },
      {
        entity: "user",
        entityId: barbaraId,
        version: 2,
        op: "delete",
        locationId: otherLocationId,
      },
      { entity: "role", entityId: removedRoleId, version: 2, op: "delete" },
    ]);

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    expect(page.changes.map(({ change_seq, ...change }) => change)).toEqual([
      { entity: "removal", entity_id: removedRoleId, removed_entity: "role", version: 2 },
      { entity: "removal", entity_id: graceId, removed_entity: "user", version: 2 },
      { entity: "removal", entity_id: graceId, removed_entity: "user", version: 2 },
      { entity: "removal", entity_id: removedRoleId, removed_entity: "role", version: 2 },
    ]);
  });

  it("pages user changes through 500 at a time, each carrying its row", async () => {
    const { deviceToken, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const cashierRoleId = await newRole("Cajera", []);
    const inserted = await db
      .insert(users)
      .values(
        Array.from({ length: 600 }, (_, index) => ({
          firstName: `Persona ${index}`,
          email: `persona-${index}@example.com`,
          locationId,
        })),
      )
      .returning({ id: users.id });
    await db
      .insert(userRoles)
      .values(inserted.map(({ id }) => ({ userId: id, roleId: cashierRoleId })));
    await db.insert(changes).values(
      inserted.map(({ id }) => ({
        entity: "user",
        entityId: id,
        version: 1,
        op: "insert" as const,
        locationId,
      })),
    );

    const first = await pullPage(SEEDED_CHANGES + 1, deviceToken);
    const second = await pullPage(first.cursor, deviceToken);

    expect(first.changes).toHaveLength(500);
    expect(second.changes).toHaveLength(100);
    expect(
      new Set([...first.changes, ...second.changes].map((change) => change.entity_id)),
    ).toEqual(new Set(inserted.map(({ id }) => id)));
  });
});

describe("GET /changes carrying the discounts", () => {
  const SEEDED_CHANGES = 4;

  async function newTag(name: string): Promise<string> {
    const outcome = await createTag(new DrizzleCatalogStore(db), { name });
    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating the tag ended as ${outcome.kind}`);
    }
    return outcome.tag.id;
  }

  async function newDiscount(tagId: string): Promise<string> {
    const outcome = await createDiscount(
      { store: new DrizzleDiscountStore(db) },
      {
        name: "Martes de infusiones",
        benefit: { kind: "PERCENT_OFF", percent: 10 },
        target: { kind: "TAG", id: tagId },
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [4, 2],
      },
    );
    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating the discount ended as ${outcome.kind}`);
    }
    return outcome.id;
  }

  it("gives a discount with its benefit, target, validity, weekdays and version, to a register of any branch", async () => {
    const [otherBranchRegister] = await db
      .insert(registers)
      .values({ locationId: await insertOtherBranch(), name: "Caja 2" })
      .returning({ id: registers.id });
    if (!otherBranchRegister) {
      throw new Error("test setup: seeding the other branch's register returned no row");
    }
    const ownBranch = await insertEnrolledInstallation(db, { now: NOW });
    const otherBranch = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: otherBranchRegister.id,
    });
    const tagId = await newTag("Infusiones");
    const discountId = await newDiscount(tagId);

    for (const { deviceToken } of [ownBranch, otherBranch]) {
      const page = await pullPage(SEEDED_CHANGES, deviceToken);

      expect(page.changes.map(({ change_seq, ...change }) => change)).toContainEqual({
        entity: "discount",
        entity_id: discountId,
        row: {
          name: "Martes de infusiones",
          benefit: { kind: "PERCENT_OFF", percent: 10 },
          target: { kind: "TAG", id: tagId },
          valid_from: "2026-10-01",
          valid_to: "2026-10-31",
          weekdays: [2, 4],
          active: true,
          version: 1,
        },
      });
    }
  });

  it("gives a switched off discount marked inactive, at its next version", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const tagId = await newTag("Infusiones");
    const discountId = await newDiscount(tagId);
    await editDiscount(
      { store: new DrizzleDiscountStore(db), clock: { now: () => new Date() } },
      {
        id: discountId,
        version: 1,
        name: "Martes de infusiones",
        benefit: { kind: "PERCENT_OFF", percent: 10 },
        target: { kind: "TAG", id: tagId },
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [2, 4],
        active: false,
      },
    );

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    expect(page.changes.filter((change) => change.entity === "discount")).toMatchObject([
      { entity_id: discountId, row: { active: false, version: 2 } },
      { entity_id: discountId, row: { active: false, version: 2 } },
    ]);
  });

  it("gives a buy-N-pay-M discount with its quantities, and a change of them at its next version", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const product = await insertProductWithTags(db, { name: "Alfajor", tagIds: [] });
    const store = new DrizzleDiscountStore(db);
    const fields = {
      name: "Alfajores 3x2",
      target: { kind: "PRODUCT" as const, id: product.id },
      validFrom: "2026-10-01",
      validTo: "2026-10-31",
      weekdays: [],
    };
    const created = await createDiscount(
      { store },
      { ...fields, benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
    );
    if (created.kind !== "created") {
      throw new Error(`test setup: creating the discount ended as ${created.kind}`);
    }

    const first = await pullPage(SEEDED_CHANGES, deviceToken);
    await editDiscount(
      { store, clock: { now: () => new Date() } },
      {
        ...fields,
        id: created.id,
        version: 1,
        benefit: { kind: "BUY_N_PAY_M", buyQty: 4, payQty: 3 },
        active: true,
      },
    );
    const second = await pullPage(first.cursor, deviceToken);

    expect(first.changes.filter((change) => change.entity === "discount")).toMatchObject([
      {
        entity_id: created.id,
        row: { benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 }, version: 1 },
      },
    ]);
    expect(second.changes.filter((change) => change.entity === "discount")).toMatchObject([
      {
        entity_id: created.id,
        row: { benefit: { kind: "BUY_N_PAY_M", buyQty: 4, payQty: 3 }, version: 2 },
      },
    ]);
  });

  it("gives a removal in place of a discount that no longer exists, at the version of its latest change", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const discountId = await newDiscount(await newTag("Infusiones"));
    await db.delete(discounts).where(eq(discounts.id, discountId));
    await db
      .insert(changes)
      .values({ entity: "discount", entityId: discountId, version: 2, op: "delete" });

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    const removals = page.changes.filter((change) => change.entity === "removal");
    expect(removals.map(({ change_seq, ...change }) => change)).toEqual([
      { entity: "removal", entity_id: discountId, removed_entity: "discount", version: 2 },
      { entity: "removal", entity_id: discountId, removed_entity: "discount", version: 2 },
    ]);
  });
});

describe("GET /changes carrying the register's own row", () => {
  const SEEDED_CHANGES = 4;

  async function newRegister(name: string): Promise<string> {
    const [actor] = await db.select({ id: users.id }).from(users).limit(1);
    const outcome = await createRegister(new DrizzleBranchRegisterStore(db, () => NOW), {
      locationId: await seededLocationId(db),
      name,
      actorId: actor?.id ?? (await insertActor(await seededLocationId(db))),
    });
    if (outcome.kind !== "created") {
      throw new Error(`test setup: creating the register ended as ${outcome.kind}`);
    }
    return outcome.register.id;
  }

  it("gives a register its own name and version once it was created", async () => {
    const registerId = await newRegister("Caja 1");
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    expect(page.changes.map(({ change_seq, ...change }) => change)).toEqual([
      { entity: "register", entity_id: registerId, row: { name: "Caja 1", version: 1 } },
    ]);
  });

  it("gives a register nothing of another register of the same branch", async () => {
    const ownId = await newRegister("Caja 1");
    const otherId = await newRegister("Caja 2");
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: ownId,
    });

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    expect(page.changes.map((change) => change.entity_id)).toEqual([ownId]);
    expect(page.changes.map((change) => change.entity_id)).not.toContain(otherId);
  });

  it("gives the register as it is now, at its version, for every change logged for it", async () => {
    const registerId = await newRegister("Caja 1");
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await db
      .update(registers)
      .set({ name: "Caja principal", version: 2 })
      .where(eq(registers.id, registerId));
    await logChange(db, { entity: "register", entityId: registerId, version: 2, op: "update" });

    const page = await pullPage(SEEDED_CHANGES, deviceToken);

    expect(page.changes.map(({ change_seq, ...change }) => change)).toEqual([
      { entity: "register", entity_id: registerId, row: { name: "Caja principal", version: 2 } },
      { entity: "register", entity_id: registerId, row: { name: "Caja principal", version: 2 } },
    ]);
  });
});

describe("the change log read for a register whose row is gone", () => {
  const SEEDED_CHANGES = 4;

  it("gives a removal at the version of its latest change", async () => {
    const { registerId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    await logChange(db, { entity: "register", entityId: registerId, version: 1, op: "insert" });
    await db.delete(registerInstallations).where(eq(registerInstallations.registerId, registerId));
    await db.delete(registers).where(eq(registers.id, registerId));
    await logChange(db, { entity: "register", entityId: registerId, version: 2, op: "delete" });

    const pulled = await new DrizzleChangeLog(db).transaction((tx) =>
      tx.changesAfter(
        pullAudienceOf({ registerId, locationId, priceListId: null }),
        SEEDED_CHANGES,
        500,
      ),
    );

    expect(pulled.map(({ changeSeq, ...change }) => change)).toEqual([
      { entity: "removal", entityId: registerId, removedEntity: "register", version: 2 },
      { entity: "removal", entityId: registerId, removedEntity: "register", version: 2 },
    ]);
  });
});
