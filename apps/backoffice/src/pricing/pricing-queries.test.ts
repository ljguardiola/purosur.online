import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { discountsKey, discountTargetsKey, pricesKeys, pricingKey } from "./pricing-queries";

test("invalidating the pricing key marks every prices list stale, whatever its filters", async () => {
  const client = new QueryClient();
  const keys = [
    pricesKeys.list({ review: "pending" }),
    pricesKeys.list({ review: "all" }),
    pricesKeys.list({ review: "all", categoryId: "category-1", search: "arroz" }),
  ];
  for (const key of keys) {
    client.setQueryData(key, []);
  }
  client.setQueryData(["other"], []);

  await client.invalidateQueries({ queryKey: pricingKey, refetchType: "none" });

  for (const key of keys) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
  expect(client.getQueryState(["other"])?.isInvalidated).toBe(false);
});

test("every pricing query is keyed under the pricing concept's root key", () => {
  const keys = [
    pricesKeys.list({ review: "all", categoryId: "category-1", search: "arroz" }),
    pricesKeys.reviewQueue,
    pricesKeys.reload,
    discountsKey,
    discountTargetsKey,
  ];

  expect(pricingKey).toEqual(["pricing"]);
  for (const key of keys) {
    expect(key.slice(0, pricingKey.length)).toEqual(pricingKey);
  }
});

test("each combination of filters has its own key, so one combination's late answer cannot land in another's list", () => {
  const filters = [
    { review: "pending" as const },
    { review: "all" as const },
    { review: "pending" as const, categoryId: "category-1" },
    { review: "pending" as const, search: "category-1" },
    { review: "pending" as const, categoryId: "category-1", search: "arroz" },
  ];

  const hashes = filters.map((input) => JSON.stringify(pricesKeys.list(input)));

  expect(new Set(hashes).size).toBe(filters.length);
});

test("the same filters always have the same key", () => {
  expect(pricesKeys.list({ review: "all", search: "arroz" })).toEqual(
    pricesKeys.list({ search: "arroz", review: "all" }),
  );
});

test("invalidating the pricing key also marks the promotions list stale", async () => {
  const client = new QueryClient();
  client.setQueryData(discountsKey, { discounts: [] });

  await client.invalidateQueries({ queryKey: pricingKey, refetchType: "none" });

  expect(client.getQueryState(discountsKey)?.isInvalidated).toBe(true);
});

test("the promotions' targets sit under the promotions key, apart from the promotions list", async () => {
  const client = new QueryClient();
  client.setQueryData(discountTargetsKey, { products: [], categories: [], tags: [] });

  await client.invalidateQueries({ queryKey: discountsKey, exact: true, refetchType: "none" });
  expect(client.getQueryState(discountTargetsKey)?.isInvalidated).toBe(false);

  await client.invalidateQueries({ queryKey: discountsKey, refetchType: "none" });
  expect(client.getQueryState(discountTargetsKey)?.isInvalidated).toBe(true);
});
