import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertLocation,
  insertProduct,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleFreightReportReader } from "./drizzle-freight-report-reader.js";
import { insertFreightRow, insertPurchaseWithLines } from "./test-support/freight-fixtures.js";

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
  return { actorId, locationId, productId };
}

async function freightOn(
  setup: Awaited<ReturnType<typeof setUp>>,
  date: string,
  amountCents: number,
  locationId = setup.locationId,
) {
  const { purchaseId } = await insertPurchaseWithLines(db, {
    locationId,
    actorId: setup.actorId,
    lines: [
      {
        productId: setup.productId,
        costPaidCents: 1_000,
        quantity: 1_000,
        quantityPerPackage: 1_000,
      },
    ],
  });
  await insertFreightRow(db, {
    locationId,
    actorId: setup.actorId,
    purchaseIds: [purchaseId],
    date,
    amountCents,
  });
}

describe("DrizzleFreightReportReader.registeredFreights", () => {
  it("answers one record per freight with its day and its amount as recorded", async () => {
    const setup = await setUp();
    await freightOn(setup, "2026-10-12", 12_345);
    await freightOn(setup, "2026-10-12", 500);

    const freights = await new DrizzleFreightReportReader(db).registeredFreights({
      locationId: setup.locationId,
      range: october,
    });

    expect(freights).toHaveLength(2);
    expect(freights).toContainEqual({ freightOn: "2026-10-12", amountCents: 12_345 });
    expect(freights).toContainEqual({ freightOn: "2026-10-12", amountCents: 500 });
  });

  it("answers a freight once however many purchases it covers", async () => {
    const setup = await setUp();
    const line = {
      productId: setup.productId,
      costPaidCents: 1_000,
      quantity: 1_000,
      quantityPerPackage: 1_000,
    };
    const first = await insertPurchaseWithLines(db, { ...setup, lines: [line] });
    const second = await insertPurchaseWithLines(db, { ...setup, lines: [line, line] });
    await insertFreightRow(db, {
      ...setup,
      purchaseIds: [first.purchaseId, second.purchaseId],
      date: "2026-10-12",
      amountCents: 7_000,
    });

    const freights = await new DrizzleFreightReportReader(db).registeredFreights({
      locationId: setup.locationId,
      range: october,
    });

    expect(freights).toEqual([{ freightOn: "2026-10-12", amountCents: 7_000 }]);
  });

  it("includes the freight of the first and of the last day of the range", async () => {
    const setup = await setUp();
    await freightOn(setup, "2026-10-01", 100);
    await freightOn(setup, "2026-10-31", 200);

    const freights = await new DrizzleFreightReportReader(db).registeredFreights({
      locationId: setup.locationId,
      range: october,
    });

    expect(freights.map(({ amountCents }) => amountCents).sort()).toEqual([100, 200]);
  });

  it("leaves out the freight of the days outside the range", async () => {
    const setup = await setUp();
    await freightOn(setup, "2026-09-30", 100);
    await freightOn(setup, "2026-11-01", 200);

    const freights = await new DrizzleFreightReportReader(db).registeredFreights({
      locationId: setup.locationId,
      range: october,
    });

    expect(freights).toEqual([]);
  });

  it("leaves out the freight of another branch", async () => {
    const setup = await setUp();
    await freightOn(setup, "2026-10-12", 100, await insertLocation(db));

    const freights = await new DrizzleFreightReportReader(db).registeredFreights({
      locationId: setup.locationId,
      range: october,
    });

    expect(freights).toEqual([]);
  });
});
