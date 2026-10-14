import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFreightListReader } from "./drizzle-freight-list-reader.js";
import {
  insertFreightRow,
  insertPurchaseWithLines,
  type SeededPurchaseLine,
} from "./test-support/freight-fixtures.js";
import { insertActor, insertProduct } from "./test-support/purchasing-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;
let locationId: string;
let line: SeededPurchaseLine;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = await insertActor(db);
  locationId = await seededLocationId(db);
  const product = await insertProduct(db, { name: "Yerba" });
  line = {
    productId: product.id,
    costPaidCents: 1_000,
    quantity: 2_000,
    quantityPerPackage: 1_000,
  };
});

const reader = () => new DrizzleFreightListReader(db);

function purchase(overrides: Partial<Parameters<typeof insertPurchaseWithLines>[1]> = {}) {
  return insertPurchaseWithLines(db, { locationId, actorId, lines: [line], ...overrides });
}

function freight(
  purchaseIds: string[],
  overrides: Partial<Parameters<typeof insertFreightRow>[1]> = {},
) {
  return insertFreightRow(db, { locationId, actorId, purchaseIds, ...overrides });
}

describe("DrizzleFreightListReader.freights", () => {
  it("lists a freight with what it says and the purchases it covers, with their suppliers", async () => {
    const first = await purchase({ purchasedOn: "2026-03-01", supplierName: "Distribuidora Sur" });
    const second = await purchase({ purchasedOn: "2026-03-04", supplierName: "Mayorista Norte" });
    const id = await freight([first.purchaseId, second.purchaseId], {
      date: "2026-03-05",
      amountCents: 25_050,
      description: "Flete a la bodega",
      means: { kind: "carrier", name: "Transportes del Sur" },
    });

    const listed = await reader().freights({ locationId, from: "2026-01-01" });

    expect(listed).toEqual([
      {
        id,
        date: "2026-03-05",
        amountCents: 25_050,
        description: "Flete a la bodega",
        means: { kind: "carrier", name: "Transportes del Sur" },
        purchases: [
          {
            id: second.purchaseId,
            purchasedOn: "2026-03-04",
            supplier: { id: second.supplierId, name: "Mayorista Norte" },
          },
          {
            id: first.purchaseId,
            purchasedOn: "2026-03-01",
            supplier: { id: first.supplierId, name: "Distribuidora Sur" },
          },
        ],
      },
    ]);
  });

  it("answers the store's own trip without a carrier", async () => {
    const { purchaseId } = await purchase();
    await freight([purchaseId], { means: { kind: "own_trip" } });

    const [listed] = await reader().freights({ locationId, from: "2026-01-01" });

    expect(listed?.means).toEqual({ kind: "own_trip" });
  });

  it("lists the newest first, the one recorded last first among a day's, and keeps the period's ends", async () => {
    const { purchaseId } = await purchase();
    const old = await freight([purchaseId], { date: "2026-02-28" });
    const first = await freight([purchaseId], {
      date: "2026-03-05",
      recordedAt: new Date("2026-03-05T10:00:00.000Z"),
    });
    const second = await freight([purchaseId], {
      date: "2026-03-05",
      recordedAt: new Date("2026-03-05T11:00:00.000Z"),
    });
    const last = await freight([purchaseId], { date: "2026-03-31" });
    const after = await freight([purchaseId], { date: "2026-04-01" });

    const listed = await reader().freights({
      locationId,
      from: "2026-03-01",
      to: "2026-03-31",
    });

    expect(listed.map(({ id }) => id)).toEqual([last, second, first]);
    expect(
      (await reader().freights({ locationId, from: "2026-02-28" })).map(({ id }) => id),
    ).toEqual([after, last, second, first, old]);
  });

  it("lists only the branch's own freights", async () => {
    const own = await purchase();
    const otherLocation = await insertLocation(db);
    const foreign = await purchase({ locationId: otherLocation });
    const ownFreight = await freight([own.purchaseId]);
    await freight([foreign.purchaseId], { locationId: otherLocation });

    const listed = await reader().freights({ locationId, from: "2026-01-01" });

    expect(listed.map(({ id }) => id)).toEqual([ownFreight]);
  });

  describe("searching", () => {
    it("finds a freight by part of its description, whatever the case", async () => {
      const { purchaseId } = await purchase();
      const found = await freight([purchaseId], { description: "Flete de Yerbas" });
      await freight([purchaseId], { description: "Viaje" });

      const listed = await reader().freights({ locationId, from: "2026-01-01", search: "yERb" });

      expect(listed.map(({ id }) => id)).toEqual([found]);
    });

    it("finds a freight by part of its carrier's name", async () => {
      const { purchaseId } = await purchase();
      const found = await freight([purchaseId], {
        means: { kind: "carrier", name: "Transportes del Sur" },
      });
      await freight([purchaseId], { means: { kind: "own_trip" } });

      const listed = await reader().freights({ locationId, from: "2026-01-01", search: "portes" });

      expect(listed.map(({ id }) => id)).toEqual([found]);
    });

    it("finds a freight by part of the name of a supplier it covers, and still lists all its purchases", async () => {
      const wanted = await purchase({ supplierName: "Mayorista Norte" });
      const other = await purchase({ supplierName: "Distribuidora Sur" });
      const found = await freight([wanted.purchaseId, other.purchaseId]);
      await freight([other.purchaseId]);

      const listed = await reader().freights({ locationId, from: "2026-01-01", search: "norte" });

      expect(listed.map(({ id }) => id)).toEqual([found]);
      expect(listed[0]?.purchases).toHaveLength(2);
    });

    it("reads the search as text, never as a pattern", async () => {
      const { purchaseId } = await purchase();
      await freight([purchaseId], { description: "Flete 100 por ciento" });
      const found = await freight([purchaseId], { description: "Descuento 10% y_más" });

      const percent = await reader().freights({ locationId, from: "2026-01-01", search: "10%" });
      const underscore = await reader().freights({ locationId, from: "2026-01-01", search: "y_m" });
      const wildcard = await reader().freights({ locationId, from: "2026-01-01", search: "%" });

      expect(percent.map(({ id }) => id)).toEqual([found]);
      expect(underscore.map(({ id }) => id)).toEqual([found]);
      expect(wildcard.map(({ id }) => id)).toEqual([found]);
    });
  });
});

describe("DrizzleFreightListReader.purchasesSince", () => {
  it("answers the branch's purchases from the day on, with their supplier, receipt and lines", async () => {
    const recent = await purchase({
      purchasedOn: "2026-03-01",
      recordedAt: new Date("2026-03-01T15:00:00.000Z"),
      supplierName: "Distribuidora Sur",
      lines: [line, { ...line, costPaidCents: 250, quantity: 500 }],
    });
    await purchase({ purchasedOn: "2026-02-28" });
    await purchase({ purchasedOn: "2026-03-02", locationId: await insertLocation(db) });

    const listed = await reader().purchasesSince(locationId, "2026-03-01");

    expect(listed).toEqual([
      {
        id: recent.purchaseId,
        purchasedOn: "2026-03-01",
        supplier: { id: recent.supplierId, name: "Distribuidora Sur" },
        recordedAt: new Date("2026-03-01T15:00:00.000Z"),
        receiptType: "sin_comprobante",
        receiptNumber: null,
        lines: [
          {
            id: recent.lineIds[0],
            costPaidCents: 1_000,
            quantity: 2_000,
            quantityPerPackage: 1_000,
          },
          { id: recent.lineIds[1], costPaidCents: 250, quantity: 500, quantityPerPackage: 1_000 },
        ],
      },
    ]);
  });
});

describe("DrizzleFreightListReader.purchasesLinkedTo", () => {
  it("answers the purchases the freight covers whenever they were bought, and no other", async () => {
    const covered = await purchase({ purchasedOn: "2020-01-01" });
    const other = await purchase();
    const freightId = await freight([covered.purchaseId]);
    await freight([other.purchaseId]);

    const listed = await reader().purchasesLinkedTo(locationId, freightId);

    expect(listed.map(({ id }) => id)).toEqual([covered.purchaseId]);
    expect(listed[0]).toMatchObject({
      purchasedOn: "2020-01-01",
      lines: [{ id: covered.lineIds[0] }],
    });
  });

  it("answers nothing for a freight of another branch", async () => {
    const otherLocation = await insertLocation(db);
    const foreign = await purchase({ locationId: otherLocation });
    const freightId = await freight([foreign.purchaseId], { locationId: otherLocation });

    expect(await reader().purchasesLinkedTo(locationId, freightId)).toEqual([]);
  });
});
