import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleLossReader } from "./drizzle-loss-reader.js";
import {
  insertLocation,
  insertMovement,
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

const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };

async function seededActor(): Promise<{ actorId: string; locationId: string }> {
  const { userId, locationId } = await signedInWith(db, [], new Date("2026-10-01T12:00:00.000Z"));
  return { actorId: userId, locationId };
}

describe("DrizzleLossReader.lossesRecorded", () => {
  it("answers each loss of the branch with its reason, its product and the quantity lost as a positive amount", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db, {
      name: "Almendras peladas",
      saleUnit: "KG",
      brandName: "Vitora",
      netContent: { quantity: 250, unit: "G" },
    });
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "loss",
      reason: "spoiled",
      delta: -1_500,
      occurredAt: new Date("2026-10-05T15:00:00.000Z"),
    });

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses).toEqual([
      {
        reason: "spoiled",
        product: {
          id: productId,
          name: "Almendras peladas",
          brandName: "Vitora",
          netContent: { quantity: 250, unit: "G" },
          saleUnit: "KG",
        },
        quantity: 1_500,
      },
    ]);
  });

  it("answers the losses the system assigns beside the ones recorded by hand", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const at = new Date("2026-10-05T15:00:00.000Z");
    for (const reason of ["theft", "return_discard", "expired"]) {
      await insertMovement(db, {
        productId,
        locationId,
        actorId,
        kind: "loss",
        reason,
        delta: -1_000,
        occurredAt: at,
      });
    }

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses.map(({ reason }) => reason).sort()).toEqual([
      "expired",
      "return_discard",
      "theft",
    ]);
  });

  it("leaves out the movements that are not losses", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const occurredAt = new Date("2026-10-05T15:00:00.000Z");
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "adjustment",
      reason: "supplier_return",
      delta: -1_000,
      occurredAt,
    });
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: -1_000,
      occurredAt,
      count: { counted: 0, expected: 1 },
    });

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses).toEqual([]);
  });

  it("answers only the losses of the branch asked", async () => {
    const { actorId, locationId } = await seededActor();
    const elsewhere = await insertLocation(db);
    const { productId } = await insertProduct(db);
    const occurredAt = new Date("2026-10-05T15:00:00.000Z");
    for (const place of [locationId, elsewhere]) {
      await insertMovement(db, {
        productId,
        locationId: place,
        actorId,
        kind: "loss",
        reason: "spoiled",
        delta: place === locationId ? -1_000 : -9_000,
        occurredAt,
      });
    }

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses.map(({ quantity }) => quantity)).toEqual([1_000]);
  });

  it("answers the losses from the first to the last Argentine day of the range and no others", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const lossAt = (occurredAt: string, delta: number) =>
      insertMovement(db, {
        productId,
        locationId,
        actorId,
        kind: "loss",
        reason: "spoiled",
        delta,
        occurredAt: new Date(occurredAt),
      });
    await lossAt("2026-10-05T02:59:59.000Z", -1_000);
    await lossAt("2026-10-05T03:00:00.000Z", -2_000);
    await lossAt("2026-10-06T02:59:59.000Z", -3_000);
    await lossAt("2026-10-06T03:00:00.000Z", -4_000);

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-05" },
    });

    expect(losses.map(({ quantity }) => quantity).sort()).toEqual([2_000, 3_000]);
  });

  it("answers a loss a later count superseded, since the stock was still lost", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    const occurredAt = new Date("2026-10-05T15:00:00.000Z");
    const countId = await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "count",
      delta: 0,
      occurredAt,
      count: { counted: 1, expected: 1 },
    });
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "loss",
      reason: "spoiled",
      delta: -1_000,
      occurredAt,
      supersededByCountId: countId,
    });

    const losses = await new DrizzleLossReader(db).lossesRecorded({
      locationId,
      range: wholeOctober,
    });

    expect(losses.map(({ quantity }) => quantity)).toEqual([1_000]);
  });

  it("refuses a stored loss whose reason is not in the catalog", async () => {
    const { actorId, locationId } = await seededActor();
    const { productId } = await insertProduct(db);
    await insertMovement(db, {
      productId,
      locationId,
      actorId,
      kind: "loss",
      reason: "lost_in_move",
      delta: -1_000,
      occurredAt: new Date("2026-10-05T15:00:00.000Z"),
    });

    await expect(
      new DrizzleLossReader(db).lossesRecorded({ locationId, range: wholeOctober }),
    ).rejects.toThrow("lost_in_move");
  });
});
