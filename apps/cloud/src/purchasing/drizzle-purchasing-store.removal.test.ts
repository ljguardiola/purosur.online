import {
  addPurchaseLines,
  findPurchaseListing,
  listPurchaseChanges,
  removePurchaseLine,
  splitPurchaseLineExpiry,
} from "@purosur/domain/purchasing/use-cases";
import { recordLoss, registerCount } from "@purosur/domain/stock/use-cases";
import { and, asc, eq } from "drizzle-orm";
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
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePurchaseChangeReader } from "./drizzle-purchase-change-reader.js";
import { DrizzlePurchaseCostReader } from "./drizzle-purchase-cost-reader.js";
import { DrizzlePurchasingListReader } from "./drizzle-purchasing-list-reader.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";
import { quantityLine, registeredPurchase } from "./test-support/registered-purchase.js";

const BUYER = { isAdministrator: false, permissionKeys: ["record_purchases"] };

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

async function purchaseOfJuiceAndFlour() {
  const juice = await insertProduct(db, { name: "Jugo" });
  const flour = await insertProduct(db, { name: "Harina" });
  const purchase = await registeredPurchase({ store: store(), clock, actorId, locationId }, [
    quantityLine(juice.id, { quantity: 5_000, costPaidCents: 2_500, expiresOn: "2026-11-10" }),
    quantityLine(flour.id, { quantity: 3_000, costPaidCents: 900 }),
  ]);
  const lines = await db.select().from(purchaseLines).orderBy(asc(purchaseLines.position));
  return {
    juice,
    flour,
    purchase,
    juiceLineId: lines[0]?.id as string,
    flourLineId: lines[1]?.id as string,
  };
}

async function removed(
  purchaseId: string,
  lineId: string,
  overrides: { locationId?: string } = {},
) {
  now = CORRECTED_AT;
  return removePurchaseLine(
    { store: store(), clock },
    { purchaseId, lineId, locationId, actorId, ...overrides },
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

describe("removing a purchase line", () => {
  it("marks the line removed when it was, keeping its row", async () => {
    const { purchase, juiceLineId } = await purchaseOfJuiceAndFlour();

    const outcome = await removed(purchase.id, juiceLineId);

    expect(outcome).toEqual({ kind: "removed", lineId: juiceLineId });
    const stored = await db.select().from(purchaseLines).orderBy(asc(purchaseLines.position));
    expect(stored.map(({ id, removedAt }) => [id, removedAt])).toEqual([
      [juiceLineId, CORRECTED_AT],
      [expect.any(String), null],
    ]);
  });

  it("takes the line's lot and its units out of stock, entered as a receipt dated when the line was received", async () => {
    const { juice, flour, purchase, juiceLineId } = await purchaseOfJuiceAndFlour();

    await removed(purchase.id, juiceLineId);

    const [lotOfJuice] = await db.select().from(lots).where(eq(lots.productId, juice.id));
    expect(lotOfJuice).toMatchObject({ withdrawn: true, remaining: 0, quantityReceived: 5_000 });
    const balances = await db.select().from(stockBalances);
    expect(balances.map(({ productId, quantity }) => [productId, quantity]).sort()).toEqual(
      [
        [juice.id, 0],
        [flour.id, 3_000],
      ].sort(),
    );
    const [removal] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.delta, -5_000));
    expect(removal).toMatchObject({
      productId: juice.id,
      kind: "receipt",
      purchaseLineId: juiceLineId,
      occurredAt: REGISTERED_AT,
      actorId,
      supersededByCountId: null,
    });
    expect(
      await db
        .select({ lotId: lotAllocations.lotId, quantity: lotAllocations.quantity })
        .from(lotAllocations)
        .where(eq(lotAllocations.movementId, removal?.id as string)),
    ).toEqual([{ lotId: lotOfJuice?.id, quantity: -5_000 }]);
  });

  it("withdraws the lots split from the line's lot too", async () => {
    const { juice, purchase, juiceLineId } = await purchaseOfJuiceAndFlour();
    now = CORRECTED_AT;
    await splitPurchaseLineExpiry(
      { store: store(), clock },
      {
        purchaseId: purchase.id,
        lineId: juiceLineId,
        locationId,
        actorId,
        quantity: 2_000,
        expiresOn: "2026-12-01",
      },
    );

    const outcome = await removed(purchase.id, juiceLineId);

    expect(outcome.kind).toBe("removed");
    const stored = await db.select().from(lots).where(eq(lots.productId, juice.id));
    expect(stored.map(({ withdrawn, remaining }) => [withdrawn, remaining])).toEqual([
      [true, 0],
      [true, 0],
    ]);
  });

  it("lists the purchase without the line, and keeps the positions of the others", async () => {
    const { juice, purchase, juiceLineId, flourLineId } = await purchaseOfJuiceAndFlour();
    await removed(purchase.id, juiceLineId);

    await addPurchaseLines(
      { store: store(), clock },
      {
        purchaseId: purchase.id,
        locationId,
        actorId,
        lines: [quantityLine(juice.id, { quantity: 1_000 })],
      },
    );

    const listed = await findPurchaseListing(
      { reader: new DrizzlePurchasingListReader(db), zoneRules: fixedZoneRulesSource() },
      purchase.id,
      BUYER,
    );
    expect(listed?.lines.map(({ id }) => id)).toEqual([flourLineId, expect.any(String)]);
    const positions = await db
      .select({ position: purchaseLines.position })
      .from(purchaseLines)
      .orderBy(asc(purchaseLines.position));
    expect(positions.map(({ position }) => position)).toEqual([1, 2, 3]);
  });

  it("makes the old product's last cost go back to its latest remaining purchase", async () => {
    const { juice, flour, juiceLineId } = await purchaseOfJuiceAndFlour();
    now = new Date("2026-10-04T12:00:00.000Z");
    const later = await registeredPurchase(
      { store: store(), clock, actorId, locationId },
      [
        quantityLine(juice.id, { quantity: 1_000, costPaidCents: 3_000 }),
        quantityLine(flour.id, { quantity: 1_000, costPaidCents: 700 }),
      ],
      "Mayorista Norte",
    );
    const [laterJuiceLine] = await db
      .select({ id: purchaseLines.id })
      .from(purchaseLines)
      .where(eq(purchaseLines.purchaseId, later.id))
      .orderBy(asc(purchaseLines.position));
    const costs = new DrizzlePurchaseCostReader(db);
    const linesOfJuice = async () =>
      (await costs.purchaseLineCostsOf(locationId, [juice.id])).map(({ lineId }) => lineId);
    expect((await linesOfJuice()).sort()).toEqual(
      [juiceLineId, laterJuiceLine?.id as string].sort(),
    );

    const outcome = await removed(later.id, laterJuiceLine?.id as string);

    expect(outcome.kind).toBe("removed");
    expect(await linesOfJuice()).toEqual([juiceLineId]);
  });

  it("leaves the product's lots of the other purchases of the day with their numbers", async () => {
    const juice = await insertProduct(db, { name: "Jugo" });
    const flour = await insertProduct(db, { name: "Harina" });
    const purchases = [];
    for (const supplier of ["Distribuidora Sur", "Molinos del Valle", "Almacen Mayorista"]) {
      purchases.push(
        await registeredPurchase(
          { store: store(), clock, actorId, locationId },
          [quantityLine(juice.id), quantityLine(flour.id)],
          supplier,
        ),
      );
    }
    const [first, second, third] = purchases.map(({ id }) => id) as [string, string, string];
    const [secondJuiceLine] = await db
      .select({ id: purchaseLines.id })
      .from(purchaseLines)
      .where(and(eq(purchaseLines.purchaseId, second), eq(purchaseLines.productId, juice.id)));

    await removed(second, secondJuiceLine?.id as string);

    const ports = {
      reader: new DrizzlePurchasingListReader(db),
      zoneRules: fixedZoneRulesSource(),
    };
    const names = [];
    for (const purchaseId of [first, third]) {
      const name = (await findPurchaseListing(ports, purchaseId, BUYER))?.lines[0]?.lotName;
      names.push([name?.day, name?.number]);
    }
    expect(names).toEqual([
      ["2026-10-01", 1],
      ["2026-10-01", 3],
    ]);
  });

  it("no longer finds the removed line", async () => {
    const { purchase, juiceLineId } = await purchaseOfJuiceAndFlour();
    await removed(purchase.id, juiceLineId);
    const before = await ledger();

    const outcome = await removed(purchase.id, juiceLineId);

    expect(outcome.kind).toBe("line_not_found");
    expect(await ledger()).toEqual(before);
  });

  it("records the removed line in the audit log and lists it among the purchase's changes", async () => {
    const { juice, purchase, juiceLineId } = await purchaseOfJuiceAndFlour();

    await removed(purchase.id, juiceLineId);

    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId,
        at: CORRECTED_AT,
        previousValue: {
          kind: "line_removed",
          lineId: juiceLineId,
          productId: juice.id,
          quantity: 5_000,
          packages: null,
          costPaidCents: 2_500,
          expiresOn: "2026-11-10",
        },
        newValue: { kind: "line_removed", lineId: juiceLineId },
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
          change: {
            kind: "line_removed",
            lineId: juiceLineId,
            product: { id: juice.id, name: "Jugo" },
            quantity: 5_000,
            packages: null,
            costPaidCents: 2_500,
            expiresOn: "2026-11-10",
          },
        },
      ],
    });
  });

  it("does not find a purchase of another branch, changing nothing", async () => {
    const { purchase, juiceLineId } = await purchaseOfJuiceAndFlour();
    const before = await ledger();

    const outcome = await removed(purchase.id, juiceLineId, {
      locationId: await insertLocation(db),
    });

    expect(outcome.kind).toBe("purchase_not_found");
    expect(await ledger()).toEqual(before);
  });

  describe("when it is refused", () => {
    it("changes nothing when some unit of the line left its lot", async () => {
      const { juice, purchase, juiceLineId } = await purchaseOfJuiceAndFlour();
      now = new Date("2026-10-03T09:00:00.000Z");
      await recordLoss(
        { store: new DrizzleStockStore(db), clock },
        { productId: juice.id, locationId, reason: "spoiled", quantity: 1_000, actorId },
      );
      const before = await ledger();

      const outcome = await removed(purchase.id, juiceLineId);

      expect(outcome).toEqual({ kind: "units_left_lot" });
      expect(await ledger()).toEqual(before);
    });

    it("changes nothing when a count of the product was taken after the line was received", async () => {
      const { juice, purchase, juiceLineId } = await purchaseOfJuiceAndFlour();
      now = CORRECTED_AT;
      await registerCount(
        { store: new DrizzleStockStore(db), clock },
        { productId: juice.id, locationId, counted: 5_000, occurredAt: COUNTED_AT, actorId },
      );
      const before = await ledger();

      const outcome = await removed(purchase.id, juiceLineId);

      expect(outcome).toEqual({ kind: "counted_since_receipt" });
      expect(await ledger()).toEqual(before);
    });

    it("changes nothing for the only line left of the purchase", async () => {
      const juice = await insertProduct(db, { name: "Jugo" });
      const purchase = await registeredPurchase({ store: store(), clock, actorId, locationId }, [
        quantityLine(juice.id),
      ]);
      const [line] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
      const before = await ledger();

      const outcome = await removed(purchase.id, line?.id as string);

      expect(outcome).toEqual({ kind: "last_line" });
      expect(await ledger()).toEqual(before);
    });
  });
});
