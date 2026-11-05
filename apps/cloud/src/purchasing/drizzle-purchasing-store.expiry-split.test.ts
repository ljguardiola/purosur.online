import {
  correctPurchaseHeader,
  correctPurchaseLineCost,
  correctPurchaseLineExpiry,
  findPurchaseListing,
  listPurchaseChanges,
  type RegisterPurchaseLine,
  splitPurchaseLineExpiry,
} from "@purosur/domain/purchasing/use-cases";
import { recordLoss } from "@purosur/domain/stock/use-cases";
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
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseChangeReader } from "./drizzle-purchase-change-reader.js";
import { DrizzlePurchasingListReader } from "./drizzle-purchasing-list-reader.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { quantityLine, registeredPurchase } from "./test-support/registered-purchase.js";

const REGISTERED_AT = new Date("2026-10-02T12:00:00.000Z");
const SPLIT_AT = new Date("2026-10-06T15:00:00.000Z");

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

async function registered(
  lines: (productId: string) => RegisterPurchaseLine[],
  productId: string,
  supplierName = "Distribuidora Sur",
) {
  return registeredPurchase(
    { store: store(), clock, actorId, locationId },
    lines(productId),
    supplierName,
  );
}

async function splitOf(
  purchaseId: string,
  lineId: string,
  quantity: number,
  expiresOn: string | null,
) {
  now = SPLIT_AT;
  return splitPurchaseLineExpiry(
    { store: store(), clock },
    { purchaseId, lineId, locationId, actorId, quantity, expiresOn },
  );
}

async function juiceLine() {
  const juice = await insertProduct(db, { name: "Jugo" });
  const purchase = await registered(
    (id) => [quantityLine(id, { quantity: 5_000, costPaidCents: 2_500, expiresOn: "2026-11-10" })],
    juice.id,
  );
  const [line] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
  return { juice, purchase, lineId: line?.id as string };
}

describe("correcting the expiry date of part of a purchase line", () => {
  it("moves the units into a lot of their own with the line's cost and purchase day, leaving the line and the rest of its lot", async () => {
    const { purchase, lineId } = await juiceLine();
    await db.update(lots).set({ remaining: 4_000 });
    const [ownBefore] = await db.select().from(lots);
    const [lineBefore] = await db.select().from(purchaseLines);

    const outcome = await splitOf(purchase.id, lineId, 1_500, "2027-01-15");

    expect(outcome.kind).toBe("split");
    const stored = await db.select().from(lots).orderBy(asc(lots.nameOrder));
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual({ ...ownBefore, remaining: 2_500 });
    expect(stored[1]).toMatchObject({
      productId: ownBefore?.productId,
      locationId,
      purchaseLineId: lineId,
      splitFromLotId: ownBefore?.id,
      quantityReceived: 1_500,
      remaining: 1_500,
      expiresOn: "2027-01-15",
      purchasedOn: "2026-10-01",
      costTotalCents: ownBefore?.costTotalCents,
      costQuantity: ownBefore?.costQuantity,
      costIncomplete: false,
      createdAt: ownBefore?.createdAt,
    });
    expect(await db.select().from(purchaseLines)).toEqual([lineBefore]);
    expect(await db.select().from(lotCostChanges)).toEqual([]);
  });

  it("records one movement of the split with no quantity and takes the units from one lot into the other", async () => {
    const { purchase, lineId } = await juiceLine();
    const [own] = await db.select().from(lots);
    const [balanceBefore] = await db.select().from(stockBalances);

    await splitOf(purchase.id, lineId, 2_000, "2027-01-15");

    const [split] = await db.select().from(lots).where(eq(lots.expiresOn, "2027-01-15"));
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.kind, "lot_split"));
    expect(movements).toEqual([
      expect.objectContaining({
        productId: own?.productId,
        locationId,
        reason: null,
        purchaseLineId: null,
        saleLineId: null,
        delta: 0,
        occurredAt: SPLIT_AT,
        actorId,
        supersededByCountId: null,
      }),
    ]);
    const allocations = await db
      .select()
      .from(lotAllocations)
      .where(eq(lotAllocations.movementId, movements[0]?.id as string));
    expect(allocations.map(({ lotId, quantity }) => [lotId, quantity]).sort()).toEqual(
      [
        [own?.id, -2_000],
        [split?.id, 2_000],
      ].sort(),
    );
    expect(await db.select().from(stockBalances)).toEqual([balanceBefore]);
  });

  it("refuses units the line's lot no longer has, changing nothing", async () => {
    const { purchase, lineId } = await juiceLine();
    await db.update(lots).set({ remaining: 2_000 });
    const before = await db.select().from(lots);
    const movementsBefore = await db.select().from(stockMovements);

    const outcome = await splitOf(purchase.id, lineId, 2_000, "2027-01-15");

    expect(outcome).toEqual({ kind: "not_enough_in_lot" });
    expect(await db.select().from(lots)).toEqual(before);
    expect(await db.select().from(stockMovements)).toEqual(movementsBefore);
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });

  it("records the units with the previous and new expiry date in the audit log", async () => {
    const { purchase, lineId } = await juiceLine();

    await splitOf(purchase.id, lineId, 1_000, "2027-01-15");

    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId,
        at: SPLIT_AT,
        previousValue: {
          kind: "line_expiry_split",
          lineId,
          quantity: 1_000,
          expiresOn: "2026-11-10",
        },
        newValue: {
          kind: "line_expiry_split",
          lineId,
          quantity: 1_000,
          expiresOn: "2027-01-15",
        },
      }),
    ]);
  });

  it("lists the split among the purchase's changes", async () => {
    const { purchase, lineId } = await juiceLine();

    await splitOf(purchase.id, lineId, 1_000, null);

    const outcome = await listPurchaseChanges(new DrizzlePurchaseChangeReader(db), {
      locationId,
      purchaseId: purchase.id,
    });
    expect(outcome).toMatchObject({
      kind: "listed",
      changes: [
        {
          actorName: "Ada Lucero",
          correctedAt: SPLIT_AT,
          change: {
            kind: "line_expiry_split",
            lineId,
            quantity: 1_000,
            previous: "2026-11-10",
            next: null,
          },
        },
      ],
    });
  });

  it("does not find a purchase of another branch, changing nothing", async () => {
    const { purchase, lineId } = await juiceLine();
    const before = await db.select().from(lots);

    now = SPLIT_AT;
    const outcome = await splitPurchaseLineExpiry(
      { store: store(), clock },
      {
        purchaseId: purchase.id,
        lineId,
        locationId: await insertLocation(db),
        actorId,
        quantity: 1_000,
        expiresOn: "2027-01-15",
      },
    );

    expect(outcome.kind).toBe("purchase_not_found");
    expect(await db.select().from(lots)).toEqual(before);
  });

  it("sells the units expiring first first, whichever lot they are in", async () => {
    const { juice, purchase, lineId } = await juiceLine();
    await splitOf(purchase.id, lineId, 2_000, "2026-10-20");
    now = new Date("2026-10-07T10:00:00.000Z");

    const outcome = await recordLoss(
      { store: new DrizzleStockStore(db), clock, zoneRules: fixedZoneRulesSource() },
      { productId: juice.id, locationId, reason: "spoiled", quantity: 1_000, actorId },
    );

    expect(outcome.kind).toBe("recorded");
    const stored = await db
      .select({ expiresOn: lots.expiresOn, remaining: lots.remaining })
      .from(lots)
      .orderBy(asc(lots.expiresOn));
    expect(stored).toEqual([
      { expiresOn: "2026-10-20", remaining: 1_000 },
      { expiresOn: "2026-11-10", remaining: 3_000 },
    ]);
  });
});

describe("correcting a purchase line that has a split lot", () => {
  it("changes only the line's own lot when the whole line's expiry date is corrected", async () => {
    const { purchase, lineId } = await juiceLine();
    await splitOf(purchase.id, lineId, 2_000, "2027-01-15");

    const outcome = await correctPurchaseLineExpiry(
      { store: store(), clock },
      { purchaseId: purchase.id, lineId, locationId, actorId, expiresOn: "2027-06-01" },
    );

    expect(outcome.kind).toBe("corrected");
    const stored = await db
      .select({ expiresOn: lots.expiresOn, split: lots.splitFromLotId })
      .from(lots)
      .orderBy(asc(lots.nameOrder));
    expect(stored).toEqual([
      { expiresOn: "2027-06-01", split: null },
      { expiresOn: "2027-01-15", split: expect.any(String) },
    ]);
  });

  it("gives every lot of the line the corrected cost, each keeping the cost it had", async () => {
    const { purchase, lineId } = await juiceLine();
    await splitOf(purchase.id, lineId, 2_000, "2027-01-15");
    now = new Date("2026-10-08T10:00:00.000Z");

    const outcome = await correctPurchaseLineCost(
      { store: store(), clock },
      { purchaseId: purchase.id, lineId, locationId, actorId, costPaidCents: 4_000 },
    );

    expect(outcome.kind).toBe("corrected");
    const stored = await db.select().from(lots);
    expect(stored).toHaveLength(2);
    for (const lot of stored) {
      expect(lot.costTotalCents).toBe(4_000);
    }
    const changes = await db.select().from(lotCostChanges);
    expect(changes.map((change) => change.lotId).sort()).toEqual(
      stored.map((lot) => lot.id).sort(),
    );
    for (const change of changes) {
      expect(change.previousCostTotalCents).toBe(2_500);
    }
  });

  it("dates the split lot by the purchase's corrected date along with the line's lot", async () => {
    const { purchase, lineId } = await juiceLine();
    await splitOf(purchase.id, lineId, 2_000, "2027-01-15");

    await correctPurchaseHeader(
      { store: store(), clock, zoneRules: fixedZoneRulesSource() },
      {
        purchaseId: purchase.id,
        locationId,
        actorId,
        purchasedOn: "2026-09-30",
        receiptType: "factura_b",
        receiptNumber: "0001-00000042",
        note: null,
      },
    );

    expect(await db.select({ purchasedOn: lots.purchasedOn }).from(lots)).toEqual([
      { purchasedOn: "2026-09-30" },
      { purchasedOn: "2026-09-30" },
    ]);
  });

  it("lists the line once, with what remains in its own lot and the name of that lot", async () => {
    const { juice, purchase, lineId } = await juiceLine();
    const other = await registered((id) => [quantityLine(id)], juice.id, "Molinos del Valle");
    await splitOf(purchase.id, lineId, 2_000, "2027-01-15");
    const ports = {
      reader: new DrizzlePurchasingListReader(db),
      zoneRules: fixedZoneRulesSource(),
    };

    const listed = await findPurchaseListing(ports, purchase.id);
    const otherListed = await findPurchaseListing(ports, other.id);

    expect(listed?.lines).toHaveLength(1);
    expect(listed?.lines[0]).toMatchObject({
      id: lineId,
      remainingInLot: 3_000,
      expiresOn: "2026-11-10",
      lotName: { day: "2026-10-01", number: 1 },
    });
    expect(otherListed?.lines[0]).toMatchObject({
      remainingInLot: 1_000,
      lotName: { day: "2026-10-01", number: 2 },
    });
  });
});
