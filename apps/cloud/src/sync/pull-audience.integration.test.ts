import { randomUUID } from "node:crypto";
import { createRole } from "@purosur/domain/access/use-cases";
import { createCategory, createProduct, createTag } from "@purosur/domain/catalog/use-cases";
import {
  configureRegisterPointOfSale,
  createFiscalAddress,
  recordBuyerIdentificationThreshold,
} from "@purosur/domain/fiscal/use-cases";
import { createDiscount, setPrice } from "@purosur/domain/pricing/use-cases";
import { pullChanges } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleRoleStore } from "../access/drizzle-role-store.js";
import { DrizzleCatalogStore } from "../catalog/drizzle-catalog-store.js";
import { DrizzleBuyerIdentificationThresholdStore } from "../fiscal/drizzle-buyer-identification-threshold-store.js";
import { DrizzleFiscalAddressStore } from "../fiscal/drizzle-fiscal-address-store.js";
import { DrizzleRegisterPointOfSaleStore } from "../fiscal/drizzle-register-point-of-sale-store.js";
import {
  branchSettings,
  locations,
  priceLists,
  prices,
  registers,
  tags,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { DrizzleDiscountStore } from "../pricing/drizzle-discount-store.js";
import { DrizzlePricingStore } from "../pricing/drizzle-pricing-store.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededPriceListId } from "../test-support/seeded-price-list.js";
import { logChange } from "./change-log.js";
import { DrizzleChangeLog } from "./drizzle-change-log.js";
import { changesLoggedAfter } from "./test-support/logged-changes.js";

interface Installation {
  deviceId: string;
  locationId: string;
  registerId: string;
}

interface Pulled {
  entity: string;
  entityId: string;
  removedEntity?: string;
}

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

let registerA1: Installation;
let registerA2: Installation;
let registerB: Installation;
let expectedShared: Pulled[];
let expectedForBranchA: Pulled[];
let expectedForBranchB: Pulled[];
let expectedForA1: Pulled[];
let expectedForA2: Pulled[];
let expectedForB: Pulled[];
let unusedPriceListId: string;
let unusedPriceId: string;

function sorted(list: readonly Pulled[]): Pulled[] {
  return [...list].sort((left, right) =>
    `${left.entityId}:${left.entity}`.localeCompare(`${right.entityId}:${right.entity}`),
  );
}

async function pullEverything(installation: Installation): Promise<Pulled[]> {
  const ports = { changeLog: new DrizzleChangeLog(db), clock: { now: () => new Date() } };
  const received: Pulled[] = [];
  let since = 0;
  for (;;) {
    const page = await pullChanges(ports, { deviceId: installation.deviceId, since });
    for (const change of page.changes) {
      received.push(
        change.entity === "removal"
          ? {
              entity: change.entity,
              entityId: change.entityId,
              removedEntity: change.removedEntity,
            }
          : { entity: change.entity, entityId: change.entityId },
      );
    }
    since = page.cursor;
    if (!page.hasMore) {
      return sorted(received);
    }
  }
}

function expectOutcome<TOutcome extends { kind: string }, TKind extends TOutcome["kind"]>(
  outcome: TOutcome,
  kind: TKind,
): Extract<TOutcome, { kind: TKind }> {
  if (outcome.kind !== kind) {
    throw new Error(`test setup: expected ${kind}, got ${outcome.kind}`);
  }
  return outcome as Extract<TOutcome, { kind: TKind }>;
}

async function insertOtherBranch(priceListId: string): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  await db.insert(branchSettings).values({ locationId: location.id, priceListId });
  await logChange(db, {
    entity: "branch_settings",
    entityId: location.id,
    version: 1,
    op: "insert",
  });
  return location.id;
}

async function insertPriceList(name: string): Promise<string> {
  const [priceList] = await db.insert(priceLists).values({ name }).returning({ id: priceLists.id });
  if (!priceList) {
    throw new Error("test setup: seeding the price list returned no row");
  }
  await logChange(db, { entity: "price_list", entityId: priceList.id, version: 1, op: "insert" });
  return priceList.id;
}

async function insertUser(
  firstName: string,
  email: string,
  locationId: string,
  roleId: string,
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName, email, locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  await logChange(db, { entity: "user", entityId: user.id, version: 1, op: "insert", locationId });
  return user.id;
}

async function insertRegisterOf(locationId: string, name: string): Promise<Installation> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  await logChange(db, { entity: "register", entityId: register.id, version: 1, op: "insert" });
  const enrolled = await insertEnrolledInstallation(db, { existingRegisterId: register.id });
  return { deviceId: enrolled.deviceId, locationId, registerId: register.id };
}

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("pull_audience");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);

  const seeded = await changesLoggedAfter(db, 0);
  const seededShared = seeded
    .filter(
      (change) => change.entity === "role" || change.entity === "buyer_identification_threshold",
    )
    .map(({ entity, entityId }) => ({ entity, entityId }));

  const administratorRoleId = seededShared.find((change) => change.entity === "role")?.entityId;
  if (administratorRoleId === undefined) {
    throw new Error("test setup: no role seeded");
  }

  const first = await insertEnrolledInstallation(db, { registerName: "Caja 1" });
  registerA1 = {
    deviceId: first.deviceId,
    locationId: first.locationId,
    registerId: first.registerId,
  };
  await logChange(db, {
    entity: "register",
    entityId: registerA1.registerId,
    version: 1,
    op: "insert",
  });
  const second = await insertEnrolledInstallation(db, { registerName: "Caja 2" });
  registerA2 = {
    deviceId: second.deviceId,
    locationId: second.locationId,
    registerId: second.registerId,
  };
  await logChange(db, {
    entity: "register",
    entityId: registerA2.registerId,
    version: 1,
    op: "insert",
  });

  const priceListA = await seededPriceListId(db);
  const priceListB = await insertPriceList("Lista B");
  unusedPriceListId = await insertPriceList("Lista sin sucursal");
  const locationB = await insertOtherBranch(priceListB);
  registerB = await insertRegisterOf(locationB, "Caja B");

  const locationA = registerA1.locationId;
  const actorA = await insertUser(
    "Marta Quiroga",
    "marta@example.com",
    locationA,
    administratorRoleId,
  );
  const userB = await insertUser(
    "Tomas Ibarra",
    "tomas@example.com",
    locationB,
    administratorRoleId,
  );
  const removedUserA = randomUUID();
  const removedUserB = randomUUID();
  await logChange(db, {
    entity: "user",
    entityId: removedUserA,
    version: 2,
    op: "delete",
    locationId: locationA,
  });
  await logChange(db, {
    entity: "user",
    entityId: removedUserB,
    version: 2,
    op: "delete",
    locationId: locationB,
  });

  const catalog = new DrizzleCatalogStore(db);
  const category = expectOutcome(
    await createCategory(catalog, { name: "Almacén", parentId: null }),
    "created",
  );
  const tag = expectOutcome(await createTag(catalog, { name: "Sin TACC" }), "created");
  const removedTag = expectOutcome(await createTag(catalog, { name: "Temporal" }), "created");
  const product = expectOutcome(
    await createProduct(catalog, {
      name: "Arroz",
      categoryId: category.category.id,
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["7790001000011"],
      netContent: null,
      tagIds: [tag.tag.id],
    }),
    "created",
  );
  await db.delete(tags).where(eq(tags.id, removedTag.tag.id));
  await logChange(db, { entity: "tag", entityId: removedTag.tag.id, version: 2, op: "delete" });

  const role = expectOutcome(
    await createRole(
      { store: new DrizzleRoleStore(db) },
      { name: "Cajera", permissionKeys: ["sell_and_charge"], actorId: actorA },
    ),
    "created",
  );
  const discount = expectOutcome(
    await createDiscount(
      { store: new DrizzleDiscountStore(db) },
      {
        name: "Martes de infusiones",
        benefit: { kind: "PERCENT_OFF", percent: 10 },
        target: { kind: "TAG", id: tag.tag.id },
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [2],
      },
    ),
    "created",
  );
  const threshold = expectOutcome(
    await recordBuyerIdentificationThreshold(
      { store: new DrizzleBuyerIdentificationThresholdStore(db) },
      { amount: 1_000_000, validFrom: "2026-10-01", actorId: actorA },
    ),
    "recorded",
  );

  const pricing = { store: new DrizzlePricingStore(db), clock: { now: () => new Date() } };
  const priceOfA = expectOutcome(
    await setPrice(pricing, {
      productId: product.product.id,
      locationId: locationA,
      unitPrice: 1000,
      expectedCurrentPriceId: null,
      actorId: actorA,
    }),
    "applied",
  );
  const priceOfB = expectOutcome(
    await setPrice(pricing, {
      productId: product.product.id,
      locationId: locationB,
      unitPrice: 1200,
      expectedCurrentPriceId: null,
      actorId: actorA,
    }),
    "applied",
  );
  const [unusedPrice] = await db
    .insert(prices)
    .values({ productId: product.product.id, priceListId: unusedPriceListId, unitPrice: 900 })
    .returning({ id: prices.id });
  if (!unusedPrice) {
    throw new Error("test setup: seeding the unused price returned no row");
  }
  unusedPriceId = unusedPrice.id;
  await logChange(db, {
    entity: "price",
    entityId: unusedPriceId,
    version: 1,
    op: "insert",
    priceListId: unusedPriceListId,
  });

  const fiscalAddress = expectOutcome(
    await createFiscalAddress(
      { store: new DrizzleFiscalAddressStore(db) },
      { name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA", actorId: actorA },
    ),
    "created",
  );
  const pointsOfSale = new DrizzleRegisterPointOfSaleStore(db);
  for (const [number, installation] of [
    [7, registerA1],
    [8, registerA2],
    [9, registerB],
  ] as const) {
    expectOutcome(
      await configureRegisterPointOfSale(pointsOfSale, {
        locationId: installation.locationId,
        registerId: installation.registerId,
        pointOfSaleNumber: number,
        fiscalAddressId: fiscalAddress.fiscalAddress.id,
        version: 0,
        actorId: actorA,
      }),
      "configured",
    );
  }

  const everyRegister = (installation: Installation): Pulled[] => [
    { entity: "register", entityId: installation.registerId },
    { entity: "register_point_of_sale", entityId: installation.registerId },
  ];
  expectedShared = [
    ...seededShared,
    { entity: "category", entityId: category.category.id },
    { entity: "product", entityId: product.product.id },
    { entity: "tag", entityId: tag.tag.id },
    { entity: "removal", entityId: removedTag.tag.id, removedEntity: "tag" },
    { entity: "removal", entityId: removedTag.tag.id, removedEntity: "tag" },
    { entity: "role", entityId: role.role.id },
    { entity: "discount", entityId: discount.id },
    { entity: "buyer_identification_threshold", entityId: threshold.threshold.id },
  ];
  expectedForBranchA = [
    { entity: "branch_settings", entityId: locationA },
    { entity: "price_list", entityId: priceListA },
    { entity: "price", entityId: priceOfA.price.id },
    { entity: "user", entityId: actorA },
    { entity: "removal", entityId: removedUserA, removedEntity: "user" },
  ];
  expectedForBranchB = [
    { entity: "branch_settings", entityId: locationB },
    { entity: "price_list", entityId: priceListB },
    { entity: "price", entityId: priceOfB.price.id },
    { entity: "user", entityId: userB },
    { entity: "removal", entityId: removedUserB, removedEntity: "user" },
  ];
  expectedForA1 = sorted([...expectedShared, ...expectedForBranchA, ...everyRegister(registerA1)]);
  expectedForA2 = sorted([...expectedShared, ...expectedForBranchA, ...everyRegister(registerA2)]);
  expectedForB = sorted([...expectedShared, ...expectedForBranchB, ...everyRegister(registerB)]);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the rows a register pulls", () => {
  it("gives a register of the first branch its branch's settings, price list, prices and users, its own register and point of sale, and every shared row", async () => {
    expect(await pullEverything(registerA1)).toEqual(expectedForA1);
  });

  it("gives the other register of the same branch the same rows, except that it gets its own register and point of sale", async () => {
    expect(await pullEverything(registerA2)).toEqual(expectedForA2);
  });

  it("gives a register of another branch its branch's settings, price list, prices and users, never the first branch's", async () => {
    expect(await pullEverything(registerB)).toEqual(expectedForB);
  });

  it("gives no register the price list or the prices of a price list no branch uses", async () => {
    for (const installation of [registerA1, registerA2, registerB]) {
      const pulled = await pullEverything(installation);
      expect(pulled).not.toContainEqual({ entity: "price_list", entityId: unusedPriceListId });
      expect(pulled).not.toContainEqual({ entity: "price", entityId: unusedPriceId });
    }
  });
});
