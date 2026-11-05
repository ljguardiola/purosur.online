import { correctPurchaseLineQuantity } from "@purosur/domain/purchasing/use-cases";
import { registerCount } from "@purosur/domain/stock/use-cases";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purchaseLines, stockMovements } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { DrizzleStockStore } from "../stock/drizzle-stock-store.js";
import { buildChangesRouteApp, pulledPage } from "../sync/test-support/changes-route.js";
import { lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { quantityLine, registeredPurchase } from "./test-support/registered-purchase.js";

const RECEIVED_AT = new Date("2026-10-09T12:00:00.000Z");
const COUNTED_AT = new Date("2026-10-09T14:00:00.000Z");
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
  app = buildChangesRouteApp(db, { zoneRules: fixedZoneRulesSource(), now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function purchaseCorrectedAfterTheRegisterLastPulled(options: { counted: boolean }) {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  let now = RECEIVED_AT;
  const clock = { now: () => now };
  const store = new DrizzlePurchasingStore(db, clock.now);
  const juice = await insertProduct(db, { name: "Jugo" });
  const purchase = await registeredPurchase({ store, clock, actorId, locationId }, [
    quantityLine(juice.id, { quantity: 5_000 }),
  ]);
  const [line] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
  now = NOW;
  if (options.counted) {
    await registerCount(
      { store: new DrizzleStockStore(db), clock },
      { productId: juice.id, locationId, counted: 5_000, occurredAt: COUNTED_AT, actorId },
    );
  }
  const loggedBefore = await lastLoggedChangeSeq(db);

  const outcome = await correctPurchaseLineQuantity(
    { store, clock },
    {
      purchaseId: purchase.id,
      lineId: line?.id as string,
      locationId,
      actorId,
      count: { loadedBy: "quantity", quantity: 3_000 },
    },
  );
  expect(outcome.kind).toBe("corrected");
  const movements = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.kind, "receipt"));
  const count = await db.select().from(stockMovements).where(eq(stockMovements.kind, "count"));
  return {
    productId: juice.id,
    loggedBefore,
    correction: movements.find(({ delta }) => delta === -2_000),
    countId: count[0]?.id,
  };
}

async function pullAfter(since: number) {
  const installation = await insertEnrolledInstallation(db, { now: NOW });
  const page = await pulledPage(app, since, installation.deviceToken);
  return page.changes.map(({ change_seq, ...change }) => change);
}

describe("the correction of a purchase line's quantity and the registers", () => {
  it("gives a register the correction as a receipt of the difference, dated when the line was received", async () => {
    const { productId, loggedBefore, correction } =
      await purchaseCorrectedAfterTheRegisterLastPulled({ counted: false });

    expect(await pullAfter(loggedBefore)).toEqual([
      {
        entity: "stock_movement",
        entity_id: correction?.id,
        row: {
          product_id: productId,
          kind: "receipt",
          delta: -2_000,
          occurred_at: RECEIVED_AT.toISOString(),
          superseded_by_count_id: null,
          version: 1,
        },
      },
    ]);
  });

  it("gives it as superseded by the count taken after the line was received", async () => {
    const { productId, loggedBefore, correction, countId } =
      await purchaseCorrectedAfterTheRegisterLastPulled({ counted: true });

    expect(await pullAfter(loggedBefore)).toEqual([
      {
        entity: "stock_movement",
        entity_id: correction?.id,
        row: {
          product_id: productId,
          kind: "receipt",
          delta: -2_000,
          occurred_at: RECEIVED_AT.toISOString(),
          superseded_by_count_id: countId,
          version: 1,
        },
      },
    ]);
  });
});
