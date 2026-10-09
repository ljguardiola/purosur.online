import { type ChangesPage, changesPageSchema } from "@purosur/contracts";
import { recordLoss, registerCount } from "@purosur/domain/stock/use-cases";
import { asc } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categories,
  locations,
  products,
  stockBalances,
  stockMovements,
  users,
} from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { DrizzleStockStore } from "../stock/drizzle-stock-store.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerChangesRoute } from "./changes-route.js";
import { lastLoggedChangeSeq } from "./test-support/logged-changes.js";

const BEFORE_COUNT = new Date("2026-10-09T14:20:00.000Z");
const COUNTED_AT = new Date("2026-10-09T15:00:00.000Z");
const NOW = new Date("2026-10-09T16:00:00.000Z");

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

async function pullAfter(since: number, deviceToken: string) {
  const response = await app.inject({
    method: "GET",
    url: `/changes?since=${since}`,
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  expect(response.statusCode).toBe(200);
  const page: ChangesPage = changesPageSchema.parse(response.json());
  return page.changes.map(({ change_seq, ...change }) => change);
}

async function insertProduct(): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name: "Almacen" })
    .returning({ id: categories.id });
  const [product] = await db
    .insert(products)
    .values({ name: "Yerba", categoryId: category?.id as string, saleUnit: "UNIT" })
    .returning({ id: products.id });
  return product?.id as string;
}

async function insertActor(locationId: string): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  return actor?.id as string;
}

function stockPortsAt(moment: Date) {
  return { store: new DrizzleStockStore(db), clock: { now: () => moment } };
}

describe("GET /changes carrying stock movements", () => {
  it("gives a register every movement of its branch, with the count that superseded it, and none of another branch", async () => {
    const locationId = await seededLocationId(db);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const otherLocationId = otherLocation?.id as string;
    const productId = await insertProduct();
    const actorId = await insertActor(locationId);
    await db.insert(stockBalances).values([
      { productId, locationId, quantity: 10_000 },
      { productId, locationId: otherLocationId, quantity: 10_000 },
    ]);
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });
    const since = await lastLoggedChangeSeq(db);

    await registerCount(stockPortsAt(NOW), {
      productId,
      locationId,
      counted: 7000,
      occurredAt: COUNTED_AT,
      actorId,
    });
    await recordLoss(stockPortsAt(BEFORE_COUNT), {
      productId,
      locationId,
      reason: "spoiled",
      quantity: 1000,
      actorId,
    });
    await recordLoss(stockPortsAt(NOW), {
      productId,
      locationId: otherLocationId,
      reason: "spoiled",
      quantity: 2000,
      actorId,
    });

    const [count, loss] = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .orderBy(asc(stockMovements.recordedAt));
    expect(await pullAfter(since, deviceToken)).toEqual([
      {
        entity: "stock_movement",
        entity_id: count?.id,
        row: {
          product_id: productId,
          kind: "count",
          delta: -3000,
          occurred_at: COUNTED_AT.toISOString(),
          superseded_by_count_id: null,
          version: 1,
        },
      },
      {
        entity: "stock_movement",
        entity_id: loss?.id,
        row: {
          product_id: productId,
          kind: "loss",
          delta: -1000,
          occurred_at: BEFORE_COUNT.toISOString(),
          superseded_by_count_id: count?.id,
          version: 1,
        },
      },
    ]);
  });
});
