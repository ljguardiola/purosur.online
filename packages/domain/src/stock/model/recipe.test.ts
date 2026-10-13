import { describe, expect, it } from "vitest";
import {
  isQuantityPerOutputUnit,
  mayBeInRecipe,
  PRODUCTS_A_RECIPE_MAY_USE,
  recipeShapeRefusal,
} from "./recipe.js";
import { MAX_STOCK_QUANTITY, STOCK_QUANTITY_PER_UNIT } from "./stock-quantity.js";

describe("PRODUCTS_A_RECIPE_MAY_USE", () => {
  it("is the active products", () => {
    expect(PRODUCTS_A_RECIPE_MAY_USE).toBe("active");
  });
});

describe("mayBeInRecipe", () => {
  it("accepts an active product and refuses an inactive one", () => {
    expect(mayBeInRecipe({ active: true })).toBe(true);
    expect(mayBeInRecipe({ active: false })).toBe(false);
  });
});

describe("isQuantityPerOutputUnit", () => {
  it("takes only whole units of a component sold by the unit", () => {
    expect(isQuantityPerOutputUnit("UNIT", 2 * STOCK_QUANTITY_PER_UNIT)).toBe(true);
    expect(isQuantityPerOutputUnit("UNIT", 2 * STOCK_QUANTITY_PER_UNIT + 1)).toBe(false);
  });

  it("takes any positive integer number of grams of a component sold by the kilo", () => {
    expect(isQuantityPerOutputUnit("KG", 1)).toBe(true);
    expect(isQuantityPerOutputUnit("KG", 250)).toBe(true);
  });

  it.each(["UNIT", "KG"] as const)(
    "refuses zero, a negative or a fractional quantity of %s",
    (unit) => {
      expect(isQuantityPerOutputUnit(unit, 0)).toBe(false);
      expect(isQuantityPerOutputUnit(unit, -STOCK_QUANTITY_PER_UNIT)).toBe(false);
      expect(isQuantityPerOutputUnit(unit, 1.5)).toBe(false);
    },
  );

  it("refuses a quantity above what a stock movement may carry", () => {
    expect(isQuantityPerOutputUnit("KG", MAX_STOCK_QUANTITY)).toBe(true);
    expect(isQuantityPerOutputUnit("KG", MAX_STOCK_QUANTITY + 1)).toBe(false);
  });
});

describe("recipeShapeRefusal", () => {
  const component = (componentProductId: string) => ({
    componentProductId,
    quantityPerOutputUnit: 500,
  });

  it("accepts a recipe of distinct components other than the assembled product", () => {
    expect(recipeShapeRefusal("mix", [component("nuts"), component("raisins")])).toBeNull();
  });

  it("refuses a recipe without components", () => {
    expect(recipeShapeRefusal("mix", [])).toEqual({ kind: "no_components" });
  });

  it("refuses the assembled product as its own component", () => {
    expect(recipeShapeRefusal("mix", [component("nuts"), component("mix")])).toEqual({
      kind: "self_component",
    });
  });

  it("refuses a component that appears twice, naming it", () => {
    expect(
      recipeShapeRefusal("mix", [component("nuts"), component("raisins"), component("nuts")]),
    ).toEqual({ kind: "repeated_component", componentProductId: "nuts" });
  });

  it("reports the first problem found in the order the components are listed", () => {
    expect(
      recipeShapeRefusal("mix", [component("nuts"), component("nuts"), component("mix")]),
    ).toEqual({ kind: "repeated_component", componentProductId: "nuts" });
    expect(
      recipeShapeRefusal("mix", [component("mix"), component("nuts"), component("nuts")]),
    ).toEqual({ kind: "self_component" });
  });
});
