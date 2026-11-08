import {
  changePurchaseLineProduct,
  removePurchaseLine,
} from "@purosur/domain/purchasing/use-cases";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../installation/test-support/enrolled-installation.js";
import { purchaseLines, stockMovements } from "../platform/db/schema.js";
import { buildChangesRouteApp, pulledPage } from "../sync/test-support/changes-route.js";
import { lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { quantityLine, registeredPurchase } from "./test-support/registered-purchase.js";

const RECEIVED_AT = new Date("2026-10-09T12:00:00.000Z");
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

async function purchaseOfTwoLinesAfterTheRegisterLastPulled() {
  const actorId = await insertActor(db);
  const locationId = await seededLocationId(db);
  let now = RECEIVED_AT;
  const clock = { now: () => now };
  const store = new DrizzlePurchasingStore(db, clock.now);
  const juice = await insertProduct(db, { name: "Jugo" });
  const nectar = await insertProduct(db, { name: "Néctar" });
  const purchase = await registeredPurchase({ store, clock, actorId, locationId }, [
    quantityLine(juice.id, { quantity: 5_000 }),
    quantityLine(nectar.id, { quantity: 2_000 }),
  ]);
  const [line] = await db
    .select({ id: purchaseLines.id })
    .from(purchaseLines)
    .orderBy(asc(purchaseLines.position));
  now = NOW;
  const loggedBefore = await lastLoggedChangeSeq(db);
  return {
    actorId,
    locationId,
    clock,
    store,
    juice,
    nectar,
    purchase,
    lineId: line?.id as string,
    loggedBefore,
  };
}

async function pullAfter(since: number) {
  const installation = await insertEnrolledInstallation(db, { now: NOW });
  const page = await pulledPage(app, since, installation.deviceToken);
  return page.changes.map(({ change_seq, ...change }) => change);
}

async function movementOf(productId: string, delta: number) {
  const [movement] = await db
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.productId, productId), eq(stockMovements.delta, delta)));
  return movement;
}

describe("the correction of a purchase line's product and the registers", () => {
  it("gives a register the two receipts of the move, dated when the line was received, and nothing else", async () => {
    const { actorId, locationId, clock, store, juice, nectar, purchase, lineId, loggedBefore } =
      await purchaseOfTwoLinesAfterTheRegisterLastPulled();

    const outcome = await changePurchaseLineProduct(
      { store, clock },
      { purchaseId: purchase.id, lineId, locationId, actorId, productId: nectar.id },
    );

    expect(outcome.kind).toBe("changed");
    const takenOut = await movementOf(juice.id, -5_000);
    const putIn = await movementOf(nectar.id, 5_000);
    expect(await pullAfter(loggedBefore)).toEqual([
      {
        entity: "stock_movement",
        entity_id: takenOut?.id,
        row: {
          product_id: juice.id,
          kind: "receipt",
          delta: -5_000,
          occurred_at: RECEIVED_AT.toISOString(),
          superseded_by_count_id: null,
          version: 1,
        },
      },
      {
        entity: "stock_movement",
        entity_id: putIn?.id,
        row: {
          product_id: nectar.id,
          kind: "receipt",
          delta: 5_000,
          occurred_at: RECEIVED_AT.toISOString(),
          superseded_by_count_id: null,
          version: 1,
        },
      },
    ]);
  });

  it("gives a register the receipt that takes a removed line's units out, and nothing else", async () => {
    const { actorId, locationId, clock, store, juice, purchase, lineId, loggedBefore } =
      await purchaseOfTwoLinesAfterTheRegisterLastPulled();

    const outcome = await removePurchaseLine(
      { store, clock },
      { purchaseId: purchase.id, lineId, locationId, actorId },
    );

    expect(outcome.kind).toBe("removed");
    const takenOut = await movementOf(juice.id, -5_000);
    expect(await pullAfter(loggedBefore)).toEqual([
      {
        entity: "stock_movement",
        entity_id: takenOut?.id,
        row: {
          product_id: juice.id,
          kind: "receipt",
          delta: -5_000,
          occurred_at: RECEIVED_AT.toISOString(),
          superseded_by_count_id: null,
          version: 1,
        },
      },
    ]);
  });
});
