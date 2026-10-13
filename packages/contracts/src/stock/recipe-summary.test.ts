import { describe, expect, it } from "vitest";
import { recipeListSchema, recipeSummarySchema } from "./recipe-summary.js";

const mix = {
  productId: "p-1",
  productName: "Mix de frutos secos",
  categoryName: "Mezclas",
  saleUnit: "KG",
  version: 2,
  lastBatch: null,
  components: [
    { componentProductId: "p-2", name: "Nueces", saleUnit: "KG", quantityPerOutputUnit: 600 },
    { componentProductId: "p-3", name: "Bolsa", saleUnit: "UNIT", quantityPerOutputUnit: 1_000 },
  ],
};
const product = { id: "p-2", name: "Nueces", saleUnit: "KG" };

describe("recipeSummarySchema", () => {
  it("accepts a recipe with components of either sale unit and no batch yet", () => {
    expect(recipeSummarySchema.safeParse(mix).data).toEqual(mix);
  });

  it("strips keys it does not define", () => {
    expect(recipeSummarySchema.safeParse({ ...mix, writtenBy: "someone" }).data).toEqual(mix);
  });

  it.each([
    "productId",
    "productName",
    "categoryName",
    "saleUnit",
    "version",
    "lastBatch",
    "components",
  ])("rejects a recipe without %s", (key) => {
    expect(recipeSummarySchema.safeParse({ ...mix, [key]: undefined }).success).toBe(false);
  });

  it("accepts the last batch with its unit cost and the moment it was assembled", () => {
    const lastBatch = {
      unitCostCents: 3_586,
      costIncomplete: false,
      assembledAt: "2026-05-04T13:00:00.000Z",
    };

    expect(recipeSummarySchema.safeParse({ ...mix, lastBatch }).data).toEqual({
      ...mix,
      lastBatch,
    });
  });

  it("accepts a last batch whose cost is incomplete and has no unit cost", () => {
    const lastBatch = {
      unitCostCents: null,
      costIncomplete: true,
      assembledAt: "2026-05-04T13:00:00.000Z",
    };

    expect(recipeSummarySchema.safeParse({ ...mix, lastBatch }).success).toBe(true);
  });

  it.each(["unitCostCents", "costIncomplete", "assembledAt"])(
    "rejects a last batch without %s",
    (key) => {
      const lastBatch = {
        unitCostCents: 3_586,
        costIncomplete: false,
        assembledAt: "2026-05-04T13:00:00.000Z",
        [key]: undefined,
      };

      expect(recipeSummarySchema.safeParse({ ...mix, lastBatch }).success).toBe(false);
    },
  );

  it("rejects a last batch moment that is not an ISO date and time", () => {
    const lastBatch = { unitCostCents: 1, costIncomplete: false, assembledAt: "yesterday" };

    expect(recipeSummarySchema.safeParse({ ...mix, lastBatch }).success).toBe(false);
  });

  it.each(["componentProductId", "name", "saleUnit", "quantityPerOutputUnit"])(
    "rejects a component without %s",
    (key) => {
      const [first] = mix.components;
      expect(
        recipeSummarySchema.safeParse({
          ...mix,
          components: [{ ...first, [key]: undefined }],
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a sale unit other than the unit or the kilo", () => {
    expect(recipeSummarySchema.safeParse({ ...mix, saleUnit: "LITER" }).success).toBe(false);
  });
});

describe("recipeListSchema", () => {
  it("accepts recipes together with the products a recipe may use", () => {
    expect(recipeListSchema.safeParse({ recipes: [mix], products: [product] }).data).toEqual({
      recipes: [mix],
      products: [product],
    });
  });

  it("accepts a business without recipes", () => {
    expect(recipeListSchema.safeParse({ recipes: [], products: [] }).success).toBe(true);
  });

  it.each(["recipes", "products"])("rejects a list without %s", (key) => {
    expect(
      recipeListSchema.safeParse({ recipes: [], products: [], [key]: undefined }).success,
    ).toBe(false);
  });

  it("strips keys of a product it does not define", () => {
    expect(
      recipeListSchema.safeParse({ recipes: [], products: [{ ...product, active: true }] }).data,
    ).toEqual({ recipes: [], products: [product] });
  });
});
