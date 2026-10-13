import { describe, expect, it } from "vitest";
import { STOCK_QUANTITY_PER_UNIT } from "../model/stock-quantity.js";
import { saveRecipe } from "./save-recipe.js";
import { FakeRecipeStore } from "./test-support/fake-recipe-store.js";

const ACTOR = "person-1";

function storeWithProducts(): FakeRecipeStore {
  const store = new FakeRecipeStore();
  store.seedProduct({ id: "mix", saleUnit: "KG", active: true });
  store.seedProduct({ id: "nuts", saleUnit: "KG", active: true });
  store.seedProduct({ id: "raisins", saleUnit: "KG", active: true });
  store.seedProduct({ id: "bag", saleUnit: "UNIT", active: true });
  store.seedProduct({ id: "retired", saleUnit: "KG", active: false });
  return store;
}

const nuts = { componentProductId: "nuts", quantityPerOutputUnit: 600 };
const raisins = { componentProductId: "raisins", quantityPerOutputUnit: 400 };
const bag = { componentProductId: "bag", quantityPerOutputUnit: STOCK_QUANTITY_PER_UNIT };

function save(store: FakeRecipeStore, input: Partial<Parameters<typeof saveRecipe>[1]> = {}) {
  return saveRecipe(store, {
    productId: "mix",
    components: [nuts, raisins],
    version: null,
    actorId: ACTOR,
    ...input,
  });
}

describe("saveRecipe", () => {
  it("saves the first recipe of a product at version 1, recording who saved it", async () => {
    const store = storeWithProducts();

    const outcome = await save(store, { components: [raisins, nuts, bag] });

    const components = [raisins, nuts, bag];
    expect(outcome).toEqual({
      kind: "saved",
      recipe: { productId: "mix", components, version: 1 },
    });
    expect(store.snapshot().recipes).toEqual([
      { productId: "mix", components, version: 1, writtenBy: ACTOR },
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("replaces the previous recipe entirely and bumps its version", async () => {
    const store = storeWithProducts();
    store.seedRecipe({ productId: "mix", components: [nuts, raisins], version: 3 });

    const outcome = await save(store, { components: [bag], version: 3 });

    expect(outcome).toEqual({
      kind: "saved",
      recipe: { productId: "mix", components: [bag], version: 4 },
    });
    expect(store.snapshot().recipes).toEqual([
      { productId: "mix", components: [bag], version: 4, writtenBy: ACTOR },
    ]);
  });

  it("answers product_not_found for an assembled product that does not exist", async () => {
    const store = storeWithProducts();

    expect(await save(store, { productId: "missing" })).toEqual({ kind: "product_not_found" });
    expect(store.snapshot().recipes).toEqual([]);
  });

  it("answers product_not_found for an inactive assembled product", async () => {
    const store = storeWithProducts();

    expect(await save(store, { productId: "retired" })).toEqual({ kind: "product_not_found" });
  });

  it("answers component_not_found, naming it, for a component that does not exist", async () => {
    const store = storeWithProducts();

    const outcome = await save(store, {
      components: [nuts, { componentProductId: "missing", quantityPerOutputUnit: 1 }],
    });

    expect(outcome).toEqual({ kind: "component_not_found", componentProductId: "missing" });
    expect(store.snapshot().recipes).toEqual([]);
  });

  it("answers component_not_found for an inactive component", async () => {
    const store = storeWithProducts();

    const outcome = await save(store, {
      components: [{ componentProductId: "retired", quantityPerOutputUnit: 100 }],
    });

    expect(outcome).toEqual({ kind: "component_not_found", componentProductId: "retired" });
  });

  it.each([
    [[], { kind: "no_components" }],
    [
      [nuts, { ...nuts, quantityPerOutputUnit: 100 }],
      { kind: "repeated_component", componentProductId: "nuts" },
    ],
    [[nuts, { componentProductId: "mix", quantityPerOutputUnit: 100 }], { kind: "self_component" }],
  ])("refuses the invalid recipe %j, leaving the previous one", async (components, reason) => {
    const store = storeWithProducts();
    store.seedRecipe({ productId: "mix", components: [raisins], version: 1 });

    const outcome = await save(store, { components, version: 1 });

    expect(outcome).toEqual({ kind: "invalid_recipe", reason });
    expect(store.snapshot().recipes).toEqual([
      { productId: "mix", components: [raisins], version: 1, writtenBy: "seed" },
    ]);
  });

  it("checks the shape rules before reading any data", async () => {
    const store = storeWithProducts();

    await save(store, { productId: "missing", components: [] });

    expect(store.transactionCount).toBe(0);
  });

  it("refuses a fractional quantity of a component sold by the unit, naming it", async () => {
    const store = storeWithProducts();

    const outcome = await save(store, {
      components: [nuts, { componentProductId: "bag", quantityPerOutputUnit: 1_500 }],
    });

    expect(outcome).toEqual({
      kind: "invalid_recipe",
      reason: { kind: "invalid_quantity", componentProductId: "bag" },
    });
  });

  it("refuses a zero quantity of a component sold by the kilo", async () => {
    const store = storeWithProducts();

    const outcome = await save(store, {
      components: [{ componentProductId: "nuts", quantityPerOutputUnit: 0 }],
    });

    expect(outcome).toEqual({
      kind: "invalid_recipe",
      reason: { kind: "invalid_quantity", componentProductId: "nuts" },
    });
  });

  it("answers stale_version when a recipe exists and none was expected", async () => {
    const store = storeWithProducts();
    store.seedRecipe({ productId: "mix", components: [nuts], version: 1 });

    expect(await save(store, { version: null })).toEqual({ kind: "stale_version" });
    expect(store.snapshot().recipes[0]?.components).toEqual([nuts]);
  });

  it("answers stale_version when a number was expected and no recipe exists", async () => {
    const store = storeWithProducts();

    expect(await save(store, { version: 1 })).toEqual({ kind: "stale_version" });
    expect(store.snapshot().recipes).toEqual([]);
  });

  it("answers stale_version when the recipe was changed since it was loaded", async () => {
    const store = storeWithProducts();
    store.seedRecipe({ productId: "mix", components: [nuts], version: 2 });

    expect(await save(store, { version: 1 })).toEqual({ kind: "stale_version" });
  });

  it("answers stale_version when the first recipe loses to a concurrent write", async () => {
    const store = storeWithProducts();
    store.firstRecipeConflicts = true;

    expect(await save(store)).toEqual({ kind: "stale_version" });
    expect(store.snapshot().recipes).toEqual([]);
  });

  it("locks the assembled product and its components together, in ascending id order", async () => {
    const store = storeWithProducts();

    await save(store, { components: [raisins, bag, nuts] });

    expect(store.lockLog).toEqual(["bag", "mix", "nuts", "raisins"]);
  });

  it("locks a component whose id sorts before the assembled product's before it", async () => {
    const store = storeWithProducts();
    store.seedProduct({ id: "almonds", saleUnit: "KG", active: true });

    await save(store, {
      productId: "nuts",
      components: [raisins, { ...nuts, componentProductId: "almonds" }],
    });

    expect(store.lockLog).toEqual(["almonds", "nuts", "raisins"]);
  });

  it("lets an unexpected failure of the store through, leaving nothing saved", async () => {
    const store = storeWithProducts();
    store.insertFailure = new RangeError("down");

    await expect(save(store)).rejects.toThrow("down");
    expect(store.snapshot().recipes).toEqual([]);
  });
});
