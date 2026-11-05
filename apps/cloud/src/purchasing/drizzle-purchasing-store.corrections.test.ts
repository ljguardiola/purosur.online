import {
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineExpiry,
  findPurchaseListing,
  listPurchaseChanges,
  type RegisterPurchaseLine,
} from "@purosur/domain/purchasing/use-cases";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  lots,
  purchaseLines,
  purchases,
  stockBalances,
  stockMovements,
} from "../platform/db/schema.js";
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

describe("adding lines to a registered purchase", () => {
  it("appends the line after the last position, enters its stock now and dates its lot by the purchase, leaving the recorded lines alone", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina" });
    const purchase = await registered((id) => [quantityLine(id, { quantity: 2_000 })], yerba.id);
    now = CORRECTED_AT;

    const outcome = await addPurchaseLines(
      { store: store(), clock },
      {
        purchaseId: purchase.id,
        locationId,
        actorId,
        lines: [quantityLine(harina.id, { quantity: 10_000, costPaidCents: 7_000 })],
      },
    );

    expect(outcome.kind).toBe("added");
    const stored = await db.select().from(purchaseLines).orderBy(asc(purchaseLines.position));
    expect(stored).toMatchObject([
      { position: 1, productId: yerba.id, quantity: 2_000, costPaidCents: 500 },
      { position: 2, productId: harina.id, quantity: 10_000, costPaidCents: 7_000 },
    ]);
    const storedLots = await db.select().from(lots).orderBy(asc(lots.quantityReceived));
    expect(storedLots).toMatchObject([
      { productId: yerba.id, quantityReceived: 2_000, remaining: 2_000, purchasedOn: "2026-10-01" },
      {
        productId: harina.id,
        purchaseLineId: stored[1]?.id,
        quantityReceived: 10_000,
        remaining: 10_000,
        purchasedOn: "2026-10-01",
      },
    ]);
    const movements = await db
      .select({ productId: stockMovements.productId, occurredAt: stockMovements.occurredAt })
      .from(stockMovements)
      .where(eq(stockMovements.productId, harina.id));
    expect(movements).toEqual([{ productId: harina.id, occurredAt: CORRECTED_AT }]);
    const [balance] = await db
      .select({ quantity: stockBalances.quantity })
      .from(stockBalances)
      .where(eq(stockBalances.productId, harina.id));
    expect(balance?.quantity).toBe(10_000);
  });

  it("records who added which lines and when, in the audit log", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina" });
    const purchase = await registered((id) => [quantityLine(id)], yerba.id);
    now = CORRECTED_AT;

    await addPurchaseLines(
      { store: store(), clock },
      {
        purchaseId: purchase.id,
        locationId,
        actorId,
        lines: [quantityLine(harina.id, { expiresOn: "2027-01-01" })],
      },
    );

    const [line] = await db
      .select({ id: purchaseLines.id })
      .from(purchaseLines)
      .where(eq(purchaseLines.productId, harina.id));
    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId,
        at: CORRECTED_AT,
        previousValue: null,
        newValue: {
          kind: "lines_added",
          lines: [
            {
              lineId: line?.id,
              productId: harina.id,
              quantity: 1_000,
              costPaidCents: 500,
              expiresOn: "2027-01-01",
            },
          ],
        },
      }),
    ]);
  });

  it("does not find a purchase of another branch, adding and recording nothing", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina" });
    const purchase = await registered((id) => [quantityLine(id)], yerba.id);

    const outcome = await addPurchaseLines(
      { store: store(), clock },
      {
        purchaseId: purchase.id,
        locationId: await insertLocation(db),
        actorId,
        lines: [quantityLine(harina.id)],
      },
    );

    expect(outcome.kind).toBe("purchase_not_found");
    expect(await db.select().from(purchaseLines)).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"))).toEqual([]);
  });
});

describe("correcting a registered purchase's header", () => {
  it("stores the corrected header and dates the purchase's lots by the corrected date", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registered((id) => [quantityLine(id)], yerba.id);
    now = CORRECTED_AT;

    const outcome = await correctPurchaseHeader(
      { store: store(), clock, zoneRules: fixedZoneRulesSource() },
      {
        purchaseId: purchase.id,
        locationId,
        actorId,
        purchasedOn: "2026-09-30",
        receiptType: "factura_b",
        receiptNumber: "0001-00000043",
        note: "Corregida",
      },
    );

    expect(outcome.kind).toBe("corrected");
    const [row] = await db.select().from(purchases).where(eq(purchases.id, purchase.id));
    expect(row).toMatchObject({
      purchasedOn: "2026-09-30",
      receiptNumber: "0001-00000043",
      note: "Corregida",
    });
    const [lot] = await db.select({ purchasedOn: lots.purchasedOn }).from(lots);
    expect(lot?.purchasedOn).toBe("2026-09-30");
  });

  it("puts the lots of a re-dated purchase after a lot created later than them", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina" });
    const redated = await registered((id) => [quantityLine(id)], yerba.id);
    await registered((id) => [quantityLine(id)], harina.id, "Molinos del Valle");
    now = CORRECTED_AT;

    await correctPurchaseHeader(
      { store: store(), clock, zoneRules: fixedZoneRulesSource() },
      {
        purchaseId: redated.id,
        locationId,
        actorId,
        purchasedOn: "2026-09-30",
        receiptType: "factura_b",
        receiptNumber: "0001-00000042",
        note: null,
      },
    );

    const stored = await db
      .select({ productId: lots.productId, nameOrder: lots.nameOrder })
      .from(lots);
    const nameOrderOf = (productId: string) =>
      stored.find((lot) => lot.productId === productId)?.nameOrder ?? Number.NaN;
    expect(nameOrderOf(yerba.id)).toBeGreaterThan(nameOrderOf(harina.id));
  });

  async function redated(purchaseId: string, purchasedOn: string) {
    const outcome = await correctPurchaseHeader(
      { store: store(), clock, zoneRules: fixedZoneRulesSource() },
      {
        purchaseId,
        locationId,
        actorId,
        purchasedOn,
        receiptType: "factura_b",
        receiptNumber: "0001-00000042",
        note: null,
      },
    );
    if (outcome.kind !== "corrected") {
      throw new Error(`test setup: correcting the purchase ended as ${outcome.kind}`);
    }
  }

  async function lotNamesOf(purchaseIds: string[]) {
    const ports = {
      reader: new DrizzlePurchasingListReader(db),
      zoneRules: fixedZoneRulesSource(),
    };
    const names = [];
    for (const purchaseId of purchaseIds) {
      const listing = await findPurchaseListing(ports, purchaseId);
      const name = listing?.lines[0]?.lotName;
      names.push([name?.day, name?.number]);
    }
    return names;
  }

  it("leaves the other purchases' lots of the day with their numbers when one purchase takes another day", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const first = await registered((id) => [quantityLine(id)], yerba.id, "Distribuidora Sur");
    const second = await registered((id) => [quantityLine(id)], yerba.id, "Molinos del Valle");
    const third = await registered((id) => [quantityLine(id)], yerba.id, "Almacen Mayorista");
    now = CORRECTED_AT;

    await redated(second.id, "2026-09-30");

    expect(await lotNamesOf([first.id, second.id, third.id])).toEqual([
      ["2026-10-01", 1],
      ["2026-09-30", null],
      ["2026-10-01", 3],
    ]);
  });

  it("numbers a re-dated lot again in the day it joins, leaving the number it had behind", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const first = await registered((id) => [quantityLine(id)], yerba.id, "Distribuidora Sur");
    const second = await registered((id) => [quantityLine(id)], yerba.id, "Molinos del Valle");
    const third = await registered((id) => [quantityLine(id)], yerba.id, "Almacen Mayorista");
    now = CORRECTED_AT;

    await redated(second.id, "2026-09-30");
    await redated(third.id, "2026-09-30");

    expect(await lotNamesOf([first.id, second.id, third.id])).toEqual([
      ["2026-10-01", 1],
      ["2026-09-30", 1],
      ["2026-09-30", 2],
    ]);
  });

  it("records only the corrected fields with their previous and new values", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registered((id) => [quantityLine(id)], yerba.id);
    now = CORRECTED_AT;

    await correctPurchaseHeader(
      { store: store(), clock, zoneRules: fixedZoneRulesSource() },
      {
        purchaseId: purchase.id,
        locationId,
        actorId,
        purchasedOn: "2026-10-01",
        receiptType: "factura_b",
        receiptNumber: "0001-00000043",
        note: "Corregida",
      },
    );

    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId,
        at: CORRECTED_AT,
        previousValue: {
          kind: "header",
          fields: { receiptNumber: "0001-00000042", note: null },
        },
        newValue: {
          kind: "header",
          fields: { receiptNumber: "0001-00000043", note: "Corregida" },
        },
      }),
    ]);
  });

  it("does not find a purchase of another branch, changing nothing", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registered((id) => [quantityLine(id)], yerba.id);

    const outcome = await correctPurchaseHeader(
      { store: store(), clock, zoneRules: fixedZoneRulesSource() },
      {
        purchaseId: purchase.id,
        locationId: await insertLocation(db),
        actorId,
        purchasedOn: "2026-09-30",
        receiptType: "factura_b",
        receiptNumber: "0001-00000042",
        note: null,
      },
    );

    expect(outcome.kind).toBe("purchase_not_found");
    const [row] = await db.select().from(purchases).where(eq(purchases.id, purchase.id));
    expect(row?.purchasedOn).toBe("2026-10-01");
  });
});

describe("correcting a purchase line's expiry date", () => {
  it("moves the line's and its lot's expiry date, leaving what remains of the lot as it was", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registered(
      (id) => [quantityLine(id, { quantity: 5_000, expiresOn: "2026-11-10" })],
      yerba.id,
    );
    await db.update(lots).set({ remaining: 3_000 });
    const [line] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
    now = CORRECTED_AT;

    const outcome = await correctPurchaseLineExpiry(
      { store: store(), clock },
      {
        purchaseId: purchase.id,
        lineId: line?.id as string,
        locationId,
        actorId,
        expiresOn: "2027-11-10",
      },
    );

    expect(outcome.kind).toBe("corrected");
    const [storedLine] = await db.select().from(purchaseLines);
    expect(storedLine?.expiresOn).toBe("2027-11-10");
    const [lot] = await db.select().from(lots);
    expect(lot).toMatchObject({
      expiresOn: "2027-11-10",
      remaining: 3_000,
      quantityReceived: 5_000,
    });
  });

  it("records the line's previous and new expiry date", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registered(
      (id) => [quantityLine(id, { expiresOn: "2026-11-10" })],
      yerba.id,
    );
    const [line] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
    now = CORRECTED_AT;

    await correctPurchaseLineExpiry(
      { store: store(), clock },
      { purchaseId: purchase.id, lineId: line?.id as string, locationId, actorId, expiresOn: null },
    );

    const rows = await db.select().from(auditLog).where(eq(auditLog.entity, "purchase"));
    expect(rows).toEqual([
      expect.objectContaining({
        entityId: purchase.id,
        actorId,
        at: CORRECTED_AT,
        previousValue: { kind: "line_expiry", lineId: line?.id, expiresOn: "2026-11-10" },
        newValue: { kind: "line_expiry", lineId: line?.id, expiresOn: null },
      }),
    ]);
  });
});

describe("the changes listed for a purchase", () => {
  it("lists every kind of change newest first, with the actor's name", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const harina = await insertProduct(db, { name: "Harina" });
    const purchase = await registered(
      (id) => [quantityLine(id, { expiresOn: "2026-11-10" })],
      yerba.id,
    );
    const [line] = await db.select({ id: purchaseLines.id }).from(purchaseLines);
    now = new Date("2026-10-03T10:00:00.000Z");
    await addPurchaseLines(
      { store: store(), clock },
      { purchaseId: purchase.id, locationId, actorId, lines: [quantityLine(harina.id)] },
    );
    now = new Date("2026-10-04T10:00:00.000Z");
    await correctPurchaseHeader(
      { store: store(), clock, zoneRules: fixedZoneRulesSource() },
      {
        purchaseId: purchase.id,
        locationId,
        actorId,
        purchasedOn: "2026-09-30",
        receiptType: "remito",
        receiptNumber: "0002-00000001",
        note: "Corregida",
      },
    );
    now = new Date("2026-10-05T10:00:00.000Z");
    await correctPurchaseLineExpiry(
      { store: store(), clock },
      { purchaseId: purchase.id, lineId: line?.id as string, locationId, actorId, expiresOn: null },
    );

    const outcome = await listPurchaseChanges(new DrizzlePurchaseChangeReader(db), {
      locationId,
      purchaseId: purchase.id,
    });

    if (outcome.kind !== "listed") {
      throw new Error(`listing the changes ended as ${outcome.kind}`);
    }
    expect(
      outcome.changes.map(({ actorName, correctedAt, change }) => ({
        actorName,
        correctedAt,
        change,
      })),
    ).toEqual([
      {
        actorName: "Ada Lucero",
        correctedAt: new Date("2026-10-05T10:00:00.000Z"),
        change: {
          kind: "line_expiry",
          lineId: line?.id,
          product: expect.objectContaining({ id: yerba.id, name: "Yerba" }),
          previous: "2026-11-10",
          next: null,
        },
      },
      {
        actorName: "Ada Lucero",
        correctedAt: new Date("2026-10-04T10:00:00.000Z"),
        change: {
          kind: "header",
          changes: [
            { field: "purchasedOn", previous: "2026-10-01", next: "2026-09-30" },
            { field: "receiptType", previous: "factura_b", next: "remito" },
            { field: "receiptNumber", previous: "0001-00000042", next: "0002-00000001" },
            { field: "note", previous: null, next: "Corregida" },
          ],
        },
      },
      {
        actorName: "Ada Lucero",
        correctedAt: new Date("2026-10-03T10:00:00.000Z"),
        change: {
          kind: "lines_added",
          lines: [
            expect.objectContaining({
              product: expect.objectContaining({ id: harina.id, name: "Harina" }),
              quantity: 1_000,
            }),
          ],
        },
      },
    ]);
  });

  it("answers nothing for a purchase of another branch", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registered((id) => [quantityLine(id)], yerba.id);

    const outcome = await listPurchaseChanges(new DrizzlePurchaseChangeReader(db), {
      locationId: await insertLocation(db),
      purchaseId: purchase.id,
    });

    expect(outcome.kind).toBe("not_found");
  });

  it("lists no change for a purchase nobody corrected", async () => {
    const yerba = await insertProduct(db, { name: "Yerba" });
    const purchase = await registered((id) => [quantityLine(id)], yerba.id);

    const outcome = await listPurchaseChanges(new DrizzlePurchaseChangeReader(db), {
      locationId,
      purchaseId: purchase.id,
    });

    expect(outcome).toEqual({ kind: "listed", changes: [] });
  });
});
