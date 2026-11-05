import {
  changePurchaseLineProduct,
  correctPurchaseLineExpiry,
  listPurchaseChanges,
  splitPurchaseLineExpiry,
} from "@purosur/domain/purchasing/use-cases";
import { recordLoss, registerCount } from "@purosur/domain/stock/use-cases";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  lotAllocations,
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
import { DrizzlePurchaseCostReader } from "./drizzle-purchase-cost-reader.js";
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

async function juiceLine() {
  const juice = await insertProduct(db, { name: "Jugo" });
  const nectar = await insertProduct(db, { name: "Néctar" });
  const purchase = await registeredPurchase({ store: store(), clock, actorId, locationId }, [
    quantityLine(juice.id, { quantity: 5_000, costPaidCents: 2_500, expiresOn: "2026-11-10" }),
  ]);
  const [row] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
  return { juice, nectar, purchase, lineId: row?.id as string };
}

async function changedTo(
  purchaseId: string,
  lineId: string,
  productId: string,
  overrides: { locationId?: string } = {},
) {
  now = CORRECTED_AT;
  return changePurchaseLineProduct(
    { store: store(), clock },
    { purchaseId, lineId, locationId, actorId, productId, ...overrides },
  );
}

async function ledger() {
  return {
    lots: await db.select().from(lots).orderBy(asc(lots.code)),
    balancesWithStock: (
      await db.select().from(stockBalances).orderBy(asc(stockBalances.productId))
    ).filter(({ quantity }) => quantity !== 0),
    movements: await db.select().from(stockMovements).orderBy(asc(stockMovements.recordedAt)),
    allocations: await db.select().from(lotAllocations),
    lines: await db.select().from(purchaseLines),
    audit: await db.select().from(auditLog),
  };
}

async function countedAt(productId: string, counted: number) {
  now = CORRECTED_AT;
  return registerCount(
    { store: new DrizzleStockStore(db), clock },
    { productId, locationId, counted, occurredAt: COUNTED_AT, actorId },
  );
}

describe("changing the product of a purchase line", () => {
  it("moves the line and its lot, with their units, cost and expiry date, to the new product", async () => {
    const { juice, nectar, purchase, lineId } = await juiceLine();
    const [lotBefore] = await db.select().from(lots);

    const outcome = await changedTo(purchase.id, lineId, nectar.id);

    expect(outcome).toEqual({ kind: "changed", lineId, productId: nectar.id });
    const [line] = await db.select().from(purchaseLines);
    expect(line).toMatchObject({ productId: nectar.id, quantity: 5_000, costPaidCents: 2_500 });
    const stored = await db.select().from(lots).orderBy(asc(lots.code));
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual({ ...lotBefore, withdrawn: true, remaining: 0 });
    expect(stored[1]).toMatchObject({
      productId: nectar.id,
      locationId,
      purchaseLineId: lineId,
      splitFromLotId: null,
      withdrawn: false,
      remaining: 5_000,
      quantityReceived: 5_000,
      costTotalCents: 2_500,
      costQuantity: 1_000,
      costIncomplete: false,
      expiresOn: "2026-11-10",
      purchasedOn: "2026-10-01",
      createdAt: lotBefore?.createdAt,
    });
    const balances = await db.select().from(stockBalances);
    expect(balances.map(({ productId, quantity }) => [productId, quantity]).sort()).toEqual(
      [
        [juice.id, 0],
        [nectar.id, 5_000],
      ].sort(),
    );
  });

  it("enters the move as two receipts dated when the line was received, each with the lot's allocation", async () => {
    const { juice, nectar, purchase, lineId } = await juiceLine();

    await changedTo(purchase.id, lineId, nectar.id);

    const receipts = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.kind, "receipt"))
      .orderBy(asc(stockMovements.recordedAt), asc(stockMovements.delta));
    expect(receipts.map(({ productId, delta }) => [productId, delta]).sort()).toEqual(
      [
        [juice.id, 5_000],
        [juice.id, -5_000],
        [nectar.id, 5_000],
      ].sort(),
    );
    for (const receipt of receipts) {
      expect(receipt).toMatchObject({
        locationId,
        purchaseLineId: lineId,
        reason: null,
        occurredAt: REGISTERED_AT,
        actorId,
        supersededByCountId: null,
      });
    }
    const [lotOfJuice, lotOfNectar] = await db.select().from(lots).orderBy(asc(lots.code));
    const allocated = async (productId: string, delta: number) => {
      const movement = receipts.find((r) => r.productId === productId && r.delta === delta);
      return db
        .select({ lotId: lotAllocations.lotId, quantity: lotAllocations.quantity })
        .from(lotAllocations)
        .where(eq(lotAllocations.movementId, movement?.id as string));
    };
    expect(await allocated(juice.id, -5_000)).toEqual([
      { lotId: lotOfJuice?.id, quantity: -5_000 },
    ]);
    expect(await allocated(nectar.id, 5_000)).toEqual([
      { lotId: lotOfNectar?.id, quantity: 5_000 },
    ]);
  });

  it("moves the lots split from the line's lot too, the new split lot pointing at the new own lot", async () => {
    const { nectar, purchase, lineId } = await juiceLine();
    now = CORRECTED_AT;
    await splitPurchaseLineExpiry(
      { store: store(), clock },
      {
        purchaseId: purchase.id,
        lineId,
        locationId,
        actorId,
        quantity: 2_000,
        expiresOn: "2026-12-01",
      },
    );

    const outcome = await changedTo(purchase.id, lineId, nectar.id);

    expect(outcome.kind).toBe("changed");
    const stored = await db.select().from(lots).orderBy(asc(lots.code));
    const withdrawn = stored.filter((lot) => lot.withdrawn);
    const moved = stored.filter((lot) => !lot.withdrawn);
    expect(withdrawn).toHaveLength(2);
    expect(moved).toHaveLength(2);
    const own = moved.find((lot) => lot.splitFromLotId === null);
    const split = moved.find((lot) => lot.splitFromLotId !== null);
    expect(own).toMatchObject({
      productId: nectar.id,
      remaining: 3_000,
      expiresOn: "2026-11-10",
    });
    expect(split).toMatchObject({
      productId: nectar.id,
      remaining: 2_000,
      expiresOn: "2026-12-01",
      splitFromLotId: own?.id,
      purchaseLineId: lineId,
    });
    const receipts = await db
      .select({ delta: stockMovements.delta })
      .from(stockMovements)
      .where(eq(stockMovements.kind, "receipt"));
    expect(receipts.map(({ delta }) => delta).sort((a, b) => a - b)).toEqual([
      -5_000, 5_000, 5_000,
    ]);
  });

  it("makes the new product's last cost come from the line and the old product's go back to its latest remaining purchase", async () => {
    const { juice, nectar, purchase, lineId } = await juiceLine();

    await changedTo(purchase.id, lineId, nectar.id);

    const costs = new DrizzlePurchaseCostReader(db);
    expect(await costs.purchaseLineCostsOf(locationId, [juice.id])).toEqual([]);
    expect(
      (await costs.purchaseLineCostsOf(locationId, [nectar.id])).map((cost) => cost.lineId),
    ).toEqual([lineId]);
  });

  it("makes a later correction of the line act on the new lot, leaving the withdrawn one alone", async () => {
    const { nectar, purchase, lineId } = await juiceLine();
    await changedTo(purchase.id, lineId, nectar.id);

    const outcome = await correctPurchaseLineExpiry(
      { store: store(), clock },
      { purchaseId: purchase.id, lineId, locationId, actorId, expiresOn: "2027-01-15" },
    );

    expect(outcome.kind).toBe("corrected");
    const stored = await db.select().from(lots).orderBy(asc(lots.code));
    expect(stored.map(({ withdrawn, expiresOn }) => [withdrawn, expiresOn])).toEqual([
      [true, "2026-11-10"],
      [false, "2027-01-15"],
    ]);
  });

  it("can move the line back, though its first lot is withdrawn", async () => {
    const { juice, nectar, purchase, lineId } = await juiceLine();
    await changedTo(purchase.id, lineId, nectar.id);

    const outcome = await changedTo(purchase.id, lineId, juice.id);

    expect(outcome.kind).toBe("changed");
    const stored = await db.select().from(lots).orderBy(asc(lots.code));
    expect(stored.map(({ withdrawn, remaining }) => [withdrawn, remaining])).toEqual([
      [true, 0],
      [true, 0],
      [false, 5_000],
    ]);
    const balances = await db.select().from(stockBalances);
    expect(balances.find(({ productId }) => productId === juice.id)?.quantity).toBe(5_000);
  });

  it("records the previous and new product in the audit log and lists them among the purchase's changes", async () => {
    const { juice, nectar, purchase, lineId } = await juiceLine();

    await changedTo(purchase.id, lineId, nectar.id);

    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId,
        at: CORRECTED_AT,
        previousValue: { kind: "line_product", lineId, productId: juice.id },
        newValue: { kind: "line_product", lineId, productId: nectar.id },
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
          change: { kind: "line_product", lineId, previous: juice.id, next: nectar.id },
        },
      ],
    });
  });

  it("does not find a purchase of another branch, changing nothing", async () => {
    const { nectar, purchase, lineId } = await juiceLine();
    const before = await ledger();

    const outcome = await changedTo(purchase.id, lineId, nectar.id, {
      locationId: await insertLocation(db),
    });

    expect(outcome.kind).toBe("purchase_not_found");
    expect(await ledger()).toEqual(before);
  });

  describe("when it is refused", () => {
    it("changes nothing when some unit of the line left its lot", async () => {
      const { juice, nectar, purchase, lineId } = await juiceLine();
      now = new Date("2026-10-03T09:00:00.000Z");
      await recordLoss(
        { store: new DrizzleStockStore(db), clock },
        { productId: juice.id, locationId, reason: "spoiled", quantity: 1_000, actorId },
      );
      const before = await ledger();

      const outcome = await changedTo(purchase.id, lineId, nectar.id);

      expect(outcome).toEqual({ kind: "units_left_lot" });
      expect(await ledger()).toEqual(before);
    });

    it("changes nothing when a count of the old product was taken after the line was received", async () => {
      const { juice, nectar, purchase, lineId } = await juiceLine();
      await countedAt(juice.id, 5_000);
      const before = await ledger();

      const outcome = await changedTo(purchase.id, lineId, nectar.id);

      expect(outcome).toEqual({ kind: "counted_since_receipt" });
      expect(await ledger()).toEqual(before);
    });

    it("changes nothing when a count of the new product was taken after the line was received", async () => {
      const { nectar, purchase, lineId } = await juiceLine();
      await countedAt(nectar.id, 0);
      const before = await ledger();

      const outcome = await changedTo(purchase.id, lineId, nectar.id);

      expect(outcome).toEqual({ kind: "counted_since_receipt" });
      expect(await ledger()).toEqual(before);
    });
  });
});
