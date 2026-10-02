import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories, productBarcodes, products } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleInternalBarcodeStore, sequenceValueOf } from "./drizzle-internal-barcode-store.js";

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

// `setval(..., false)` makes the very next `nextval` return exactly `value`.
async function setNextSequenceValue(value: bigint): Promise<void> {
  await testDatabase.client.query("select setval('internal_barcode_sequence', $1, false)", [
    value.toString(),
  ]);
}

async function insertProductWithBarcode(code: string, active: boolean): Promise<void> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Macetas ${code}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({ name: "Existing", categoryId: category.id, saleUnit: "UNIT", active })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  await db.insert(productBarcodes).values({ productId: product.id, code, position: 0, active });
}

describe("sequenceValueOf", () => {
  it("reads the value from a driver that returns the row array itself", () => {
    expect(sequenceValueOf([{ value: "41" }])).toBe(41n);
  });

  it("reads the value from a driver that returns its rows under a rows key", () => {
    expect(sequenceValueOf({ rows: [{ value: "42" }] })).toBe(42n);
  });

  it("refuses a result with no row", () => {
    expect(() => sequenceValueOf([])).toThrow("internal-barcode: nextval returned no row");
    expect(() => sequenceValueOf({ rows: [] })).toThrow(
      "internal-barcode: nextval returned no row",
    );
    expect(() => sequenceValueOf({})).toThrow("internal-barcode: nextval returned no row");
  });

  it("reads a value a driver returns as a bigint or an integer number", () => {
    expect(sequenceValueOf({ rows: [{ value: 43n }] })).toBe(43n);
    expect(sequenceValueOf({ rows: [{ value: 44 }] })).toBe(44n);
  });

  it("refuses a row whose value is not an integer", () => {
    expect(() => sequenceValueOf([{ value: 7.5 }])).toThrow(
      "internal-barcode: nextval returned a row without an integer value",
    );
    expect(() => sequenceValueOf({ rows: [{}] })).toThrow(
      "internal-barcode: nextval returned a row without an integer value",
    );
    expect(() => sequenceValueOf({ rows: [null] })).toThrow(
      "internal-barcode: nextval returned a row without an integer value",
    );
  });
});

describe("DrizzleInternalBarcodeStore", () => {
  it("answers the next internal barcode body from the sequence", async () => {
    await setNextSequenceValue(200000000100n);
    const store = new DrizzleInternalBarcodeStore(db);

    expect(await store.nextInternalBarcodeBody()).toBe(200000000100n);
    expect(await store.nextInternalBarcodeBody()).toBe(200000000101n);
  });

  it("answers that a code is assigned when a product has it, active or not", async () => {
    await insertProductWithBarcode("2000000000015", true);
    await insertProductWithBarcode("2000000000022", false);
    const store = new DrizzleInternalBarcodeStore(db);

    expect(await store.isBarcodeAssigned("2000000000015")).toBe(true);
    expect(await store.isBarcodeAssigned("2000000000022")).toBe(true);
  });

  it("answers that a code no product has is not assigned", async () => {
    await insertProductWithBarcode("2000000000015", true);

    expect(await new DrizzleInternalBarcodeStore(db).isBarcodeAssigned("2000000000039")).toBe(
      false,
    );
  });
});
