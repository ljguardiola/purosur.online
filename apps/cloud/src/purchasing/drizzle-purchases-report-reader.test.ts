import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purchaseLines } from "../platform/db/schema.js";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePurchasesReportReader } from "./drizzle-purchases-report-reader.js";
import { insertPurchaseOfLines, insertSupplier } from "./test-support/purchases-report-fixtures.js";

const NOW = new Date("2026-10-20T15:00:00.000Z");
const october = { from: "2026-10-01", to: "2026-10-31" };

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

async function setUp() {
  const { userId: actorId, locationId } = await signedInWith(db, [], NOW);
  const { productId } = await insertProduct(db);
  const supplierId = await insertSupplier(db, { actorId, name: "Distribuidora Sur" });
  return { actorId, locationId, productId, supplierId };
}

const aLine = { costPaidCents: 1_001, quantity: 2_000, quantityPerPackage: 1_000 };

describe("DrizzlePurchasesReportReader.purchasedLines", () => {
  it("answers one record per purchase line with its supplier, its day and its cost pair", async () => {
    const { actorId, locationId, productId, supplierId } = await setUp();
    const purchaseId = await insertPurchaseOfLines(db, {
      supplierId,
      locationId,
      actorId,
      productId,
      purchasedOn: "2026-10-12",
      lines: [aLine, { costPaidCents: 500, quantity: 3_000, quantityPerPackage: 3_000 }],
    });

    const lines = await new DrizzlePurchasesReportReader(db).purchasedLines({
      locationId,
      range: october,
    });

    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual({
      purchaseId,
      supplierId,
      supplierName: "Distribuidora Sur",
      purchasedOn: "2026-10-12",
      costPaidCents: 1_001,
      quantity: 2_000,
      quantityPerPackage: 1_000,
    });
    expect(lines).toContainEqual({
      purchaseId,
      supplierId,
      supplierName: "Distribuidora Sur",
      purchasedOn: "2026-10-12",
      costPaidCents: 500,
      quantity: 3_000,
      quantityPerPackage: 3_000,
    });
  });

  it("includes the purchases of the first and of the last day of the range", async () => {
    const { actorId, locationId, productId, supplierId } = await setUp();
    const common = { supplierId, locationId, actorId, productId, lines: [aLine] };
    const first = await insertPurchaseOfLines(db, { ...common, purchasedOn: "2026-10-01" });
    const last = await insertPurchaseOfLines(db, { ...common, purchasedOn: "2026-10-31" });

    const lines = await new DrizzlePurchasesReportReader(db).purchasedLines({
      locationId,
      range: october,
    });

    expect(lines.map((line) => line.purchaseId).sort()).toEqual([first, last].sort());
  });

  it("leaves out the purchases of the days outside the range", async () => {
    const { actorId, locationId, productId, supplierId } = await setUp();
    const common = { supplierId, locationId, actorId, productId, lines: [aLine] };
    await insertPurchaseOfLines(db, { ...common, purchasedOn: "2026-09-30" });
    await insertPurchaseOfLines(db, { ...common, purchasedOn: "2026-11-01" });

    const lines = await new DrizzlePurchasesReportReader(db).purchasedLines({
      locationId,
      range: october,
    });

    expect(lines).toEqual([]);
  });

  it("leaves out the purchases of another branch", async () => {
    const { actorId, locationId, productId, supplierId } = await setUp();
    const otherLocationId = await insertLocation(db);
    await insertPurchaseOfLines(db, {
      supplierId,
      locationId: otherLocationId,
      actorId,
      productId,
      purchasedOn: "2026-10-12",
      lines: [aLine],
    });

    const lines = await new DrizzlePurchasesReportReader(db).purchasedLines({
      locationId,
      range: october,
    });

    expect(lines).toEqual([]);
  });
});

describe("DrizzlePurchasesReportReader.purchasedLines removed lines", () => {
  it("does not answer a line that was removed from its purchase", async () => {
    const { actorId, locationId, productId, supplierId } = await setUp();
    const purchaseId = await insertPurchaseOfLines(db, {
      supplierId,
      locationId,
      actorId,
      productId,
      purchasedOn: "2026-10-12",
      lines: [aLine, { costPaidCents: 500, quantity: 3_000, quantityPerPackage: 3_000 }],
    });
    const [, second] = await db
      .select({ id: purchaseLines.id })
      .from(purchaseLines)
      .where(eq(purchaseLines.purchaseId, purchaseId))
      .orderBy(purchaseLines.position);
    await db
      .update(purchaseLines)
      .set({ removedAt: NOW })
      .where(eq(purchaseLines.id, second?.id as string));

    const lines = await new DrizzlePurchasesReportReader(db).purchasedLines({
      locationId,
      range: october,
    });

    expect(lines).toEqual([expect.objectContaining({ purchaseId, costPaidCents: 1_001 })]);
  });
});
