import {
  type EditFreightInput,
  editFreight,
  type FreightValues,
  recordFreight,
} from "@purosur/domain/purchasing/use-cases";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, freightPurchases, freights } from "../platform/db/schema.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFreightStore } from "./drizzle-freight-store.js";
import { insertFreightRow, insertPurchaseWithLines } from "./test-support/freight-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

const NOW = new Date("2026-03-10T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let recorderId: string;
let editorId: string;
let locationId: string;
let productId: string;

const store = () => new DrizzleFreightStore(db, () => NOW);
const ports = () => ({ store: store(), clock: { now: () => NOW } });

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  recorderId = await insertActor(db);
  editorId = await insertActor(db);
  locationId = await seededLocationId(db);
  productId = (await insertProduct(db, { name: "Yerba" })).id;
});

function seedPurchase(overrides: { locationId?: string } = {}) {
  return insertPurchaseWithLines(db, {
    locationId: overrides.locationId ?? locationId,
    actorId: recorderId,
    lines: [
      { productId, costPaidCents: 1_000, quantity: 2_000, quantityPerPackage: 1_000 },
      { productId, costPaidCents: 500, quantity: 1_000, quantityPerPackage: 1_000 },
    ],
  });
}

function values(purchaseIds: string[], overrides: Partial<FreightValues> = {}): FreightValues {
  return {
    date: "2026-03-09",
    amountCents: 12_000,
    description: "Flete a la bodega",
    means: { kind: "carrier", name: "Transportes del Sur" },
    purchaseIds,
    ...overrides,
  };
}

async function record(purchaseIds: string[]) {
  const outcome = await recordFreight(ports(), {
    ...values(purchaseIds),
    locationId,
    actorId: recorderId,
  });
  if (outcome.kind !== "recorded") {
    throw new Error(`test setup: recording the freight ended as ${outcome.kind}`);
  }
  return outcome.freight;
}

function edit(freightId: string, next: FreightValues, overrides: Partial<EditFreightInput> = {}) {
  return editFreight(ports(), {
    ...next,
    freightId,
    locationId,
    actorId: editorId,
    ...overrides,
  });
}

describe("the freights a freight store keeps", () => {
  it("stores the freight with who recorded it and when, and the purchases it covers", async () => {
    const first = await seedPurchase();
    const second = await seedPurchase();

    const freight = await record([second.purchaseId, first.purchaseId]);

    const [row] = await db.select().from(freights).where(eq(freights.id, freight.id));
    expect(row).toMatchObject({
      locationId,
      freightOn: "2026-03-09",
      amountCents: 12_000,
      description: "Flete a la bodega",
      meansKind: "carrier",
      carrierName: "Transportes del Sur",
      recordedAt: NOW,
      actorId: recorderId,
      updatedAt: NOW,
    });
    const links = await db.select().from(freightPurchases);
    expect(links.map(({ purchaseId }) => purchaseId).sort()).toEqual(
      [first.purchaseId, second.purchaseId].sort(),
    );
  });

  it("stores the store's own trip without a carrier", async () => {
    const purchase = await seedPurchase();

    const outcome = await recordFreight(ports(), {
      ...values([purchase.purchaseId], { means: { kind: "own_trip" } }),
      locationId,
      actorId: recorderId,
    });

    expect(outcome.kind).toBe("recorded");
    expect(await db.select().from(freights)).toMatchObject([
      { meansKind: "own_trip", carrierName: null },
    ]);
  });

  it("does not find a purchase of another branch", async () => {
    const foreign = await seedPurchase({ locationId: await insertLocation(db) });

    const outcome = await recordFreight(ports(), {
      ...values([foreign.purchaseId]),
      locationId,
      actorId: recorderId,
    });

    expect(outcome).toEqual({ kind: "purchase_not_found" });
    expect(await db.select().from(freights)).toEqual([]);
  });

  it("answers the lines of the branch's purchases in their position order, whichever purchases are asked for", async () => {
    const purchase = await seedPurchase();
    const foreign = await seedPurchase({ locationId: await insertLocation(db) });

    const found = await store().transaction((tx) =>
      tx.lockPurchasesForFreight(locationId, [purchase.purchaseId, foreign.purchaseId]),
    );

    expect(found).toEqual([
      {
        id: purchase.purchaseId,
        lines: [
          {
            id: purchase.lineIds[0],
            costPaidCents: 1_000,
            quantity: 2_000,
            quantityPerPackage: 1_000,
          },
          {
            id: purchase.lineIds[1],
            costPaidCents: 500,
            quantity: 1_000,
            quantityPerPackage: 1_000,
          },
        ],
      },
    ]);
  });
});

describe("editing a freight through a freight store", () => {
  it("replaces what the freight says and the purchases it covers", async () => {
    const original = await seedPurchase();
    const replacement = await seedPurchase();
    const freight = await record([original.purchaseId]);

    const outcome = await edit(
      freight.id,
      values([replacement.purchaseId], {
        date: "2026-03-08",
        amountCents: 15_500,
        description: "Viaje propio",
        means: { kind: "own_trip" },
      }),
    );

    expect(outcome.kind).toBe("edited");
    expect(await db.select().from(freights)).toMatchObject([
      {
        id: freight.id,
        freightOn: "2026-03-08",
        amountCents: 15_500,
        description: "Viaje propio",
        meansKind: "own_trip",
        carrierName: null,
        updatedAt: NOW,
      },
    ]);
    expect(await db.select().from(freightPurchases)).toEqual([
      { freightId: freight.id, purchaseId: replacement.purchaseId },
    ]);
  });

  it("keeps who recorded the freight and when, though another person edits it later", async () => {
    const purchase = await seedPurchase();
    const freight = await record([purchase.purchaseId]);
    const later = new DrizzleFreightStore(db, () => new Date("2026-03-20T09:00:00.000Z"));

    await editFreight(
      { store: later, clock: { now: () => new Date("2026-03-20T09:00:00.000Z") } },
      {
        ...values([purchase.purchaseId], { amountCents: 13_000 }),
        freightId: freight.id,
        locationId,
        actorId: editorId,
      },
    );

    expect(await db.select().from(freights)).toMatchObject([
      { amountCents: 13_000, actorId: recorderId, recordedAt: NOW },
    ]);
  });

  it("writes an audit record naming who edited it, with what it said before and after", async () => {
    const original = await seedPurchase();
    const replacement = await seedPurchase();
    const freight = await record([original.purchaseId]);
    const next = values([replacement.purchaseId], {
      amountCents: 13_000,
      means: { kind: "own_trip" },
    });

    await edit(freight.id, next);

    expect(await db.select().from(auditLog).orderBy(asc(auditLog.at))).toMatchObject([
      {
        entity: "freight",
        entityId: freight.id,
        actorId: editorId,
        at: NOW,
        previousValue: values([original.purchaseId]),
        newValue: next,
      },
    ]);
  });

  it("writes no audit record when the freight is only recorded", async () => {
    const purchase = await seedPurchase();

    await record([purchase.purchaseId]);

    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("does not find the freight of another branch", async () => {
    const purchase = await seedPurchase();
    const foreignLocation = await insertLocation(db);
    const foreignPurchase = await seedPurchase({ locationId: foreignLocation });
    const foreignFreight = await insertFreightRow(db, {
      locationId: foreignLocation,
      actorId: recorderId,
      purchaseIds: [foreignPurchase.purchaseId],
    });

    const outcome = await edit(foreignFreight, values([purchase.purchaseId]));

    expect(outcome).toEqual({ kind: "freight_not_found" });
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("leaves the freight as it was when a purchase of the edit is not the branch's", async () => {
    const original = await seedPurchase();
    const foreign = await seedPurchase({ locationId: await insertLocation(db) });
    const freight = await record([original.purchaseId]);

    const outcome = await edit(freight.id, values([foreign.purchaseId], { amountCents: 1 }));

    expect(outcome).toEqual({ kind: "purchase_not_found" });
    expect(await db.select().from(freights)).toMatchObject([{ amountCents: 12_000 }]);
    expect(await db.select().from(freightPurchases)).toEqual([
      { freightId: freight.id, purchaseId: original.purchaseId },
    ]);
  });
});
