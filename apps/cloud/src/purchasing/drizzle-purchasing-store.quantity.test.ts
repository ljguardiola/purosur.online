import {
  correctPurchaseLineQuantity,
  listPurchaseChanges,
  type PurchaseLineCount,
  type RegisterPurchaseLine,
  splitPurchaseLineExpiry,
} from "@purosur/domain/purchasing/use-cases";
import { registerCount } from "@purosur/domain/stock/use-cases";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  lotAllocations,
  lotCostChanges,
  lots,
  purchaseLines,
  stockBalances,
  stockMovements,
} from "../platform/db/schema.js";
import { DrizzleStockStore } from "../stock/drizzle-stock-store.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseChangeReader } from "./drizzle-purchase-change-reader.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { quantityLine, registeredPurchase } from "./test-support/registered-purchase.js";

const REGISTERED_AT = new Date("2026-10-02T12:00:00.000Z");
const COUNTED_AT = new Date("2026-10-03T10:00:00.000Z");
const CORRECTED_AT = new Date("2026-10-06T15:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let now = REGISTERED_AT;

const store = () => new DrizzlePurchasingStore(db, () => now);
const clock = { now: () => now };

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  now = REGISTERED_AT;
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
});

async function registered(line: (productId: string) => RegisterPurchaseLine, name = "Jugo") {
  const product = await insertProduct(db, { name });
  const purchase = await registeredPurchase({ store: store(), clock, actorId, locationId }, [
    line(product.id),
  ]);
  const [row] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
  return { product, purchase, lineId: row?.id as string };
}

function juiceLine() {
  return registered((id) =>
    quantityLine(id, { quantity: 5_000, costPaidCents: 2_500, expiresOn: "2026-11-10" }),
  );
}

async function correctedTo(
  purchaseId: string,
  lineId: string,
  count: PurchaseLineCount,
  overrides: { locationId?: string } = {},
) {
  now = CORRECTED_AT;
  return correctPurchaseLineQuantity(
    { store: store(), clock },
    { purchaseId, lineId, locationId, actorId, count, ...overrides },
  );
}

const byQuantity = (quantity: number): PurchaseLineCount => ({ loadedBy: "quantity", quantity });

async function countedAt(productId: string, counted: number, occurredAt: Date) {
  return registerCount(
    { store: new DrizzleStockStore(db), clock },
    { productId, locationId, counted, occurredAt, actorId },
  );
}

async function receiptCorrection() {
  const movements = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.kind, "receipt"))
    .orderBy(asc(stockMovements.recordedAt));
  return movements[1];
}

describe("correcting the quantity of a purchase line", () => {
  it("takes the units from the line and its lot, from the product's balance and from the lot's allocations", async () => {
    const { product, purchase, lineId } = await juiceLine();
    await db.update(lots).set({ remaining: 4_000 });
    const [lotBefore] = await db.select().from(lots);

    const outcome = await correctedTo(purchase.id, lineId, byQuantity(3_000));

    expect(outcome).toEqual({ kind: "corrected", lineId, quantity: 3_000, packages: null });
    const [line] = await db.select().from(purchaseLines);
    expect(line).toMatchObject({ quantity: 3_000, packages: null, costPaidCents: 2_500 });
    const [lot] = await db.select().from(lots);
    expect(lot).toEqual({ ...lotBefore, remaining: 2_000, quantityReceived: 3_000 });
    const [balance] = await db.select().from(stockBalances);
    expect(balance).toMatchObject({ productId: product.id, quantity: 3_000 });
    const movement = await receiptCorrection();
    expect(movement).toMatchObject({
      productId: product.id,
      locationId,
      kind: "receipt",
      reason: null,
      purchaseLineId: lineId,
      delta: -2_000,
      occurredAt: REGISTERED_AT,
      actorId,
      supersededByCountId: null,
    });
    expect(
      await db
        .select({ lotId: lotAllocations.lotId, quantity: lotAllocations.quantity })
        .from(lotAllocations)
        .where(eq(lotAllocations.movementId, movement?.id as string)),
    ).toEqual([{ lotId: lot?.id, quantity: -2_000 }]);
    expect(await db.select().from(lotCostChanges)).toEqual([]);
  });

  it("adds the units to the line's lot at the line's cost and with its expiry date", async () => {
    const { purchase, lineId } = await juiceLine();
    const [lotBefore] = await db.select().from(lots);

    const outcome = await correctedTo(purchase.id, lineId, byQuantity(7_000));

    expect(outcome.kind).toBe("corrected");
    const [lot] = await db.select().from(lots);
    expect(lot).toEqual({ ...lotBefore, remaining: 7_000, quantityReceived: 7_000 });
    expect(lot).toMatchObject({
      costTotalCents: 2_500,
      costQuantity: 1_000,
      expiresOn: "2026-11-10",
    });
    const [balance] = await db.select().from(stockBalances);
    expect(balance?.quantity).toBe(7_000);
    expect((await receiptCorrection())?.delta).toBe(2_000);
  });

  it("corrects a line loaded by packages by its packages, keeping the quantity of each package", async () => {
    const { purchase, lineId } = await registered((id) => ({
      loadedBy: "packages",
      productId: id,
      packages: 2,
      quantityPerPackage: 6_000,
      costPaidCents: 1_000,
      expiresOn: null,
    }));

    const outcome = await correctedTo(purchase.id, lineId, { loadedBy: "packages", packages: 3 });

    expect(outcome).toEqual({ kind: "corrected", lineId, quantity: 18_000, packages: 3 });
    const [line] = await db.select().from(purchaseLines);
    expect(line).toMatchObject({ packages: 3, quantity: 18_000, quantityPerPackage: 6_000 });
    const [lot] = await db.select().from(lots);
    expect(lot).toMatchObject({ quantityReceived: 18_000, remaining: 18_000 });
  });

  it("refuses more units than the line's lot has left, changing nothing", async () => {
    const { purchase, lineId } = await juiceLine();
    await db.update(lots).set({ remaining: 2_000 });
    const lotsBefore = await db.select().from(lots);
    const movementsBefore = await db.select().from(stockMovements);
    const balanceBefore = await db.select().from(stockBalances);

    const outcome = await correctedTo(purchase.id, lineId, byQuantity(2_000));

    expect(outcome).toEqual({ kind: "not_enough_in_lot" });
    expect(await db.select().from(lots)).toEqual(lotsBefore);
    expect(await db.select().from(stockMovements)).toEqual(movementsBefore);
    expect(await db.select().from(stockBalances)).toEqual(balanceBefore);
    expect((await db.select().from(purchaseLines))[0]?.quantity).toBe(5_000);
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it("lets all the units still in the line's lot go", async () => {
    const { purchase, lineId } = await juiceLine();
    await db.update(lots).set({ remaining: 2_000 });

    const outcome = await correctedTo(purchase.id, lineId, byQuantity(3_000));

    expect(outcome.kind).toBe("corrected");
    expect((await db.select().from(lots))[0]?.remaining).toBe(0);
  });

  it("bounds the units by the line's own lot, leaving a lot split from it as it was", async () => {
    const { purchase, lineId } = await juiceLine();
    now = CORRECTED_AT;
    await splitPurchaseLineExpiry(
      { store: store(), clock },
      { purchaseId: purchase.id, lineId, locationId, actorId, quantity: 3_000, expiresOn: null },
    );

    const refused = await correctedTo(purchase.id, lineId, byQuantity(2_000));
    const allowed = await correctedTo(purchase.id, lineId, byQuantity(3_000));

    expect(refused).toEqual({ kind: "not_enough_in_lot" });
    expect(allowed.kind).toBe("corrected");
    const stored = await db.select().from(lots).orderBy(asc(lots.nameOrder));
    expect(stored.map(({ remaining, quantityReceived }) => [remaining, quantityReceived])).toEqual([
      [0, 3_000],
      [3_000, 3_000],
    ]);
  });

  it("refuses a quantity the product is not sold in, changing nothing", async () => {
    const { purchase, lineId } = await juiceLine();
    const lotsBefore = await db.select().from(lots);

    const outcome = await correctedTo(purchase.id, lineId, byQuantity(5_500));

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(await db.select().from(lots)).toEqual(lotsBefore);
    expect(await db.select().from(stockMovements)).toHaveLength(1);
  });

  it("does not find a purchase of another branch, changing nothing", async () => {
    const { purchase, lineId } = await juiceLine();
    const lotsBefore = await db.select().from(lots);

    const outcome = await correctedTo(purchase.id, lineId, byQuantity(3_000), {
      locationId: await insertLocation(db),
    });

    expect(outcome.kind).toBe("purchase_not_found");
    expect(await db.select().from(lots)).toEqual(lotsBefore);
  });

  it("records the previous and new quantity in the audit log and lists them among the purchase's changes", async () => {
    const { purchase, lineId } = await juiceLine();

    await correctedTo(purchase.id, lineId, byQuantity(3_000));

    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId,
        at: CORRECTED_AT,
        previousValue: { kind: "line_quantity", lineId, quantity: 5_000, packages: null },
        newValue: { kind: "line_quantity", lineId, quantity: 3_000, packages: null },
      }),
    ]);
    const outcome = await listPurchaseChanges(new DrizzlePurchaseChangeReader(db), {
      locationId,
      purchaseId: purchase.id,
    });
    expect(outcome).toMatchObject({
      kind: "listed",
      changes: [
        {
          correctedAt: CORRECTED_AT,
          change: {
            kind: "line_quantity",
            lineId,
            previous: { quantity: 5_000, packages: null },
            next: { quantity: 3_000, packages: null },
          },
        },
      ],
    });
  });

  it("records a packages line's previous and new packages", async () => {
    const { purchase, lineId } = await registered((id) => ({
      loadedBy: "packages",
      productId: id,
      packages: 2,
      quantityPerPackage: 6_000,
      costPaidCents: 1_000,
      expiresOn: null,
    }));

    await correctedTo(purchase.id, lineId, { loadedBy: "packages", packages: 1 });

    const [row] = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(row).toMatchObject({
      previousValue: { kind: "line_quantity", lineId, quantity: 12_000, packages: 2 },
      newValue: { kind: "line_quantity", lineId, quantity: 6_000, packages: 1 },
    });
  });

  describe("when a count of the product was taken after the line was received", () => {
    it("changes the line, the audit and the units the lot was received with, but neither the balance nor the lot's units", async () => {
      const { product, purchase, lineId } = await juiceLine();
      now = CORRECTED_AT;
      await countedAt(product.id, 5_000, COUNTED_AT);
      const [count] = await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.kind, "count"));
      const lotBefore = (await db.select().from(lots))[0];
      const balanceBefore = await db.select().from(stockBalances);

      const outcome = await correctedTo(purchase.id, lineId, byQuantity(3_000));

      expect(outcome.kind).toBe("corrected");
      expect((await db.select().from(purchaseLines))[0]?.quantity).toBe(3_000);
      expect((await db.select().from(lots))[0]).toEqual({ ...lotBefore, quantityReceived: 3_000 });
      expect(await db.select().from(stockBalances)).toEqual(balanceBefore);
      const movement = (
        await db.select().from(stockMovements).where(eq(stockMovements.kind, "receipt"))
      ).find(({ delta }) => delta === -2_000);
      expect(movement).toMatchObject({
        purchaseLineId: lineId,
        occurredAt: REGISTERED_AT,
        supersededByCountId: count?.id,
      });
      expect(
        await db
          .select()
          .from(lotAllocations)
          .where(eq(lotAllocations.movementId, movement?.id as string)),
      ).toEqual([]);
      expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toHaveLength(
        1,
      );
    });

    it("does not bound the units that go by what the lot has left", async () => {
      const { product, purchase, lineId } = await juiceLine();
      now = CORRECTED_AT;
      await countedAt(product.id, 5_000, COUNTED_AT);
      await db.update(lots).set({ remaining: 0 });

      const outcome = await correctedTo(purchase.id, lineId, byQuantity(1_000));

      expect(outcome.kind).toBe("corrected");
      expect((await db.select().from(lots))[0]?.remaining).toBe(0);
    });
  });

  it("makes a count dated between the receipt and the correction, registered after it, expect the corrected quantity", async () => {
    const { product, purchase, lineId } = await juiceLine();
    await correctedTo(purchase.id, lineId, byQuantity(3_000));

    const outcome = await countedAt(product.id, 3_000, COUNTED_AT);

    expect(outcome).toMatchObject({ kind: "recorded", expected: 3_000, delta: 0 });
  });
});
