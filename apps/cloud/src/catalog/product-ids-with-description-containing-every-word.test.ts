import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import {
  type DescribedProduct,
  productIdsWithDescriptionContainingEveryWord,
} from "./product-ids-with-description-containing-every-word.js";

const SMALL_OIL: DescribedProduct = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Aceite de Almendras",
  brandName: "Vitora",
  netContent: { quantity: 30, unit: "ML" },
};
const LARGE_OIL: DescribedProduct = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Aceite de Almendras",
  brandName: "Vitora",
  netContent: { quantity: 60, unit: "ML" },
};
const HONEY: DescribedProduct = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Miel",
  brandName: null,
  netContent: { quantity: 1.5, unit: "KG" },
};
const PEPPER: DescribedProduct = {
  id: "00000000-0000-4000-8000-000000000004",
  name: "Kırmızı Biber Clásico",
  brandName: null,
  netContent: null,
};
const JUICE: DescribedProduct = {
  id: "00000000-0000-4000-8000-000000000005",
  name: "Jugo 100% natural",
  brandName: null,
  netContent: null,
};
const PRODUCTS = [SMALL_OIL, LARGE_OIL, HONEY, PEPPER, JUICE];

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

async function matching(search: string, products = PRODUCTS): Promise<string[]> {
  return [
    ...(await productIdsWithDescriptionContainingEveryWord(testDatabase.db, products, search)),
  ].sort();
}

describe("productIdsWithDescriptionContainingEveryWord", () => {
  it("keeps the products whose shown description holds every word, in any order and apart", async () => {
    expect(await matching("vitora 60")).toEqual([LARGE_OIL.id]);
    expect(await matching("60 ml aceite vitora")).toEqual([LARGE_OIL.id]);
    expect(await matching("almendras vitora")).toEqual([SMALL_OIL.id, LARGE_OIL.id]);
  });

  it("matches the net content as it is shown, with a decimal comma", async () => {
    expect(await matching("miel 1,5 kg")).toEqual([HONEY.id]);
    expect(await matching("miel 1.5")).toEqual([]);
  });

  it("ignores accents and case as the database folds them", async () => {
    expect(await matching("KIRMIZI clasico")).toEqual([PEPPER.id]);
  });

  it("takes % and _ literally", async () => {
    expect(await matching("%")).toEqual([JUICE.id]);
    expect(await matching("_")).toEqual([]);
  });

  it("keeps nothing when no product is given", async () => {
    expect(await matching("vitora", [])).toEqual([]);
  });
});
