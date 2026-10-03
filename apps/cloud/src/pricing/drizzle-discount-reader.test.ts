import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertProductWithTags,
  insertTag,
} from "../catalog/test-support/catalog-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleDiscountReader } from "./drizzle-discount-reader.js";
import { insertCategory, insertDiscount } from "./test-support/discount-route-fixtures.js";

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

describe("DrizzleDiscountReader", () => {
  it("reads nothing when there are no discounts", async () => {
    expect(await new DrizzleDiscountReader(db).discounts()).toEqual([]);
  });

  it("reads every discount by name, active or not, each with the name of its target", async () => {
    const category = await insertCategory(db, "Infusiones");
    const tag = await insertTag(db, { name: "Sin TACC" });
    const product = await insertProductWithTags(db, { name: "Yerba mate", tagIds: [] });
    const onCategory = await insertDiscount(db, {
      name: "Martes de infusiones",
      categoryId: category,
      percent: 10,
      weekdays: [2],
    });
    const onTag = await insertDiscount(db, {
      name: "Semana sin TACC",
      tagId: tag.id,
      percent: 20,
      validFrom: "2026-11-01",
      validTo: "2026-11-07",
      active: false,
      version: 3,
    });
    const onProduct = await insertDiscount(db, {
      name: "Yerba en oferta",
      productId: product.id,
      percent: 5,
    });

    expect(await new DrizzleDiscountReader(db).discounts()).toEqual([
      {
        id: onCategory.id,
        name: "Martes de infusiones",
        benefit: { kind: "PERCENT_OFF", percent: 10 },
        target: { kind: "CATEGORY", id: category, name: "Infusiones" },
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [2],
        active: true,
        version: 1,
      },
      {
        id: onTag.id,
        name: "Semana sin TACC",
        benefit: { kind: "PERCENT_OFF", percent: 20 },
        target: { kind: "TAG", id: tag.id, name: "Sin TACC" },
        validFrom: "2026-11-01",
        validTo: "2026-11-07",
        weekdays: [],
        active: false,
        version: 3,
      },
      {
        id: onProduct.id,
        name: "Yerba en oferta",
        benefit: { kind: "PERCENT_OFF", percent: 5 },
        target: { kind: "PRODUCT", id: product.id, name: "Yerba mate" },
        validFrom: "2026-10-01",
        validTo: "2026-10-31",
        weekdays: [],
        active: true,
        version: 1,
      },
    ]);
  });

  it("reads discounts of the same name in the order of their ids", async () => {
    const category = await insertCategory(db, "Infusiones");
    const first = await insertDiscount(db, { name: "Igual", categoryId: category });
    const second = await insertDiscount(db, { name: "Igual", categoryId: category });

    const read = await new DrizzleDiscountReader(db).discounts();

    expect(read.map(({ id }) => id)).toEqual([first.id, second.id].sort());
  });

  it("reads a buy-N-pay-M discount with its quantities", async () => {
    const product = await insertProductWithTags(db, { name: "Alfajor", tagIds: [] });
    const discount = await insertDiscount(db, {
      name: "Alfajores 3x2",
      productId: product.id,
      kind: "BUY_N_PAY_M",
      percent: null,
      buyQty: 3,
      payQty: 2,
    });

    expect(await new DrizzleDiscountReader(db).discounts()).toMatchObject([
      { id: discount.id, benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } },
    ]);
  });

  it("reads one discount by its id, and no other", async () => {
    const category = await insertCategory(db, "Infusiones");
    await insertDiscount(db, { name: "Otra", categoryId: category });
    const wanted = await insertDiscount(db, { name: "Elegida", categoryId: category });

    expect(await new DrizzleDiscountReader(db).discount(wanted.id)).toMatchObject({
      id: wanted.id,
      name: "Elegida",
      target: { kind: "CATEGORY", id: category, name: "Infusiones" },
    });
  });

  it("reads nothing for an id no discount has", async () => {
    const category = await insertCategory(db, "Infusiones");
    await insertDiscount(db, { categoryId: category });

    expect(
      await new DrizzleDiscountReader(db).discount("00000000-0000-0000-0000-000000000000"),
    ).toBeUndefined();
  });
});
