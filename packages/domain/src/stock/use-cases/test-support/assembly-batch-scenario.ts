import type { Recipe } from "../recipe-store.js";
import type { RegisterAssemblyBatchInput } from "../register-assembly-batch.js";
import { FakeStockStore } from "./fake-stock-store.js";

export const BRANCH = "branch-1";
export const MIX = { productId: "product-mix", locationId: BRANCH };
export const NUTS = { productId: "product-nuts", locationId: BRANCH };
export const BAG = { productId: "product-bag", locationId: BRANCH };

export const RECIPE: Recipe = {
  productId: MIX.productId,
  version: 2,
  components: [
    { componentProductId: NUTS.productId, quantityPerOutputUnit: 600 },
    { componentProductId: BAG.productId, quantityPerOutputUnit: 1_000 },
  ],
};

export function storeWithRecipe({ nutsInLots = true } = {}): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: MIX.productId, saleUnit: "KG" });
  store.seedProduct({ id: NUTS.productId, saleUnit: "KG" });
  store.seedProduct({ id: BAG.productId, saleUnit: "UNIT" });
  store.seedRecipe(RECIPE);
  store.seedBalance({ ...NUTS, quantity: 15_000 });
  store.seedBalance({ ...BAG, quantity: 50_000 });
  if (nutsInLots) {
    store.seedLot({
      id: "nuts-late",
      ...NUTS,
      remaining: 10_000,
      expiresOn: "2027-03-01",
      costTotalCents: 5_000,
      costQuantity: 1_000,
    });
    store.seedLot({
      id: "nuts-soon",
      ...NUTS,
      remaining: 5_000,
      expiresOn: "2027-01-15",
      costTotalCents: 3_000,
      costQuantity: 1_000,
    });
  }
  store.seedLot({
    id: "bag-lot",
    ...BAG,
    remaining: 50_000,
    expiresOn: null,
    costTotalCents: 100,
    costQuantity: 1_000,
  });
  return store;
}

export function assemblyBatchInput(
  overrides: Partial<RegisterAssemblyBatchInput> = {},
): RegisterAssemblyBatchInput {
  return {
    productId: MIX.productId,
    locationId: BRANCH,
    recipeVersion: 2,
    used: [
      { componentProductId: NUTS.productId, quantity: 12_000 },
      { componentProductId: BAG.productId, quantity: 2_000 },
    ],
    output: 14_000,
    actorId: "person-1",
    ...overrides,
  };
}
