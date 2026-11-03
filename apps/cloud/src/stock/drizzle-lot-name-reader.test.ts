import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleLotNameReader } from "./drizzle-lot-name-reader.js";
import { insertAssemblyBatch } from "./test-support/assembly-batch-fixtures.js";
import {
  insertInitialCountLot,
  insertPurchasedLot,
  insertTechnicalLot,
} from "./test-support/lot-fixtures.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "./test-support/stock-route-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function seededActor(): Promise<{ actorId: string; locationId: string }> {
  const { userId, locationId } = await signedInWith(db, [], new Date("2026-10-01T12:00:00.000Z"));
  return { actorId: userId, locationId };
}

describe("DrizzleLotNameReader.lotNameFacts", () => {
  it("answers the facts of a purchased lot: its purchase's day, not the day it was recorded", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const lotId = await insertPurchasedLot(db, {
      productId,
      locationId,
      actorId,
      purchasedOn: "2026-11-03",
      createdAt: new Date("2026-11-05T12:00:00.000Z"),
    });

    const facts = await new DrizzleLotNameReader(db).lotNameFacts(locationId, [productId]);

    expect(facts).toEqual([
      {
        lotId,
        productId,
        locationId,
        nameOrder: expect.any(Number),
        origin: { kind: "purchase", purchasedOn: "2026-11-03" },
      },
    ]);
  });

  it("answers the moment the opening count was taken for a lot of the initial count, withdrawn ones included", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const countedAt = new Date("2026-10-27T15:00:00.000Z");
    const kept = await insertInitialCountLot(db, { productId, locationId, actorId, countedAt });
    const withdrawn = await insertInitialCountLot(db, {
      productId,
      locationId,
      actorId,
      countedAt,
      withdrawn: true,
    });

    const facts = await new DrizzleLotNameReader(db).lotNameFacts(locationId, [productId]);

    expect(facts.map(({ lotId, origin }) => ({ lotId, origin }))).toEqual(
      expect.arrayContaining([
        { lotId: kept.lotId, origin: { kind: "initial_count", countedAt } },
        { lotId: withdrawn.lotId, origin: { kind: "initial_count", countedAt } },
      ]),
    );
    expect(facts).toHaveLength(2);
  });

  it("answers the batch's moment for an assembled lot and the moment it was opened for a technical one", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const assembledAt = new Date("2026-05-04T13:00:00.000Z");
    const openedAt = new Date("2026-06-07T09:00:00.000Z");
    const assembled = await insertAssemblyBatch(db, {
      productId,
      locationId,
      actorId,
      assembledAt,
    });
    const technical = await insertTechnicalLot(db, {
      productId,
      locationId,
      remaining: -500,
      createdAt: openedAt,
    });

    const facts = await new DrizzleLotNameReader(db).lotNameFacts(locationId, [productId]);

    expect(facts.map(({ lotId, origin }) => ({ lotId, origin }))).toEqual(
      expect.arrayContaining([
        { lotId: assembled.lotId, origin: { kind: "assembly_batch", assembledAt } },
        { lotId: technical, origin: { kind: "technical", openedAt } },
      ]),
    );
    expect(facts).toHaveLength(2);
  });

  it("answers the order each lot took its name, which grows with each lot created", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const first = await insertPurchasedLot(db, { productId, locationId, actorId });
    const second = await insertPurchasedLot(db, { productId, locationId, actorId });

    const facts = await new DrizzleLotNameReader(db).lotNameFacts(locationId, [productId]);

    const orderOf = (lotId: string) => facts.find((fact) => fact.lotId === lotId)?.nameOrder;
    expect(orderOf(second)).toBeGreaterThan(orderOf(first) as number);
  });

  it("answers the lots of the asked products and branch only", async () => {
    const { actorId, locationId } = await seededActor();
    const otherLocationId = await insertLocation(db);
    const asked = await insertProduct(db);
    const other = await insertProduct(db);
    const mine = await insertPurchasedLot(db, { productId: asked.productId, locationId, actorId });
    await insertPurchasedLot(db, { productId: other.productId, locationId, actorId });
    await insertPurchasedLot(db, {
      productId: asked.productId,
      locationId: otherLocationId,
      actorId,
    });

    const facts = await new DrizzleLotNameReader(db).lotNameFacts(locationId, [asked.productId]);

    expect(facts.map((fact) => fact.lotId)).toEqual([mine]);
  });

  it("answers nothing when no product is asked for", async () => {
    const { locationId } = await seededActor();

    expect(await new DrizzleLotNameReader(db).lotNameFacts(locationId, [])).toEqual([]);
  });
});
