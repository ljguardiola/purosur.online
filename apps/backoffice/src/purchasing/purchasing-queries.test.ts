import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { purchasingKey, purchasingKeys } from "./purchasing-queries";

test("invalidating the purchasing key marks the suppliers, the packagings, the purchases, the purchase choices, the freights, the linkable purchases, the supplier price lists and each review stale", async () => {
  const client = new QueryClient();
  const keys = [
    purchasingKeys.suppliers,
    purchasingKeys.packagings,
    purchasingKeys.purchases,
    purchasingKeys.purchaseChoices,
    purchasingKeys.freights,
    purchasingKeys.linkablePurchases,
    purchasingKeys.supplierPriceLists,
    [...purchasingKeys.supplierPriceListReview, "list-1"],
  ];
  for (const key of keys) {
    client.setQueryData(key, []);
  }
  client.setQueryData(["other"], []);

  await client.invalidateQueries({ queryKey: purchasingKey, refetchType: "none" });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryState(["other"])?.isInvalidated).toBe(false);
});

test("every purchasing read has its own key", () => {
  const keys = Object.values(purchasingKeys).map((key) => key.join("/"));
  expect(new Set(keys).size).toBe(keys.length);
});
