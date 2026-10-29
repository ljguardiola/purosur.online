import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import {
  purchasesReportKey,
  purchasingKey,
  purchasingKeys,
  useProductCreationChoicesRefresh,
} from "./purchasing-queries";

test("invalidating the purchasing key marks the suppliers, the packagings, the purchases, the purchase choices, the freights, the linkable purchases, the supplier price lists, each review, each proposal, the link choices, the categories a created product is filed under and the price comparison and each purchases report stale", async () => {
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
    [...purchasingKeys.supplierItemLinkProposal, "list-1", "row-1"],
    purchasingKeys.supplierItemLinkChoices,
    purchasingKeys.productCreationCategories,
    purchasingKeys.supplierPriceComparison,
    purchasesReportKey({ from: "2026-10-01", to: "2026-10-07" }),
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

test.each([
  { part: "start", changed: { from: "2026-10-02" } },
  { part: "end", changed: { to: "2026-10-08" } },
])("a purchases report differing only in its $part has its own key", ({ changed }) => {
  const query = { from: "2026-10-01", to: "2026-10-07" };

  expect(purchasesReportKey({ ...query, ...changed })).not.toEqual(purchasesReportKey(query));
});

async function watchedChoices() {
  const client = new QueryClient();
  const reads = {
    brands: vi.fn().mockResolvedValue([]),
    tags: vi.fn().mockResolvedValue({ tags: [] }),
    categories: vi.fn().mockResolvedValue([]),
  };
  for (const [queryKey, queryFn] of [
    [purchasingKeys.productCreationBrands, reads.brands],
    [purchasingKeys.productCreationTags, reads.tags],
    [purchasingKeys.productCreationCategories, reads.categories],
  ] as const) {
    new QueryObserver(client, { queryKey, queryFn }).subscribe(() => {});
  }
  for (const read of Object.values(reads)) {
    await expect.poll(() => read.mock.calls.length).toBe(1);
  }
  const { result } = await renderHook(() => useProductCreationChoicesRefresh(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, reads, refresh: result.current };
}

test("marking the product creation choices stale marks the brands and the tags out of date without reading them, and leaves the categories alone", async () => {
  const { client, reads, refresh } = await watchedChoices();

  await refresh.markStale();

  expect(client.getQueryState(purchasingKeys.productCreationBrands)?.isInvalidated).toBe(true);
  expect(client.getQueryState(purchasingKeys.productCreationTags)?.isInvalidated).toBe(true);
  expect(client.getQueryState(purchasingKeys.productCreationCategories)?.isInvalidated).toBe(false);
  expect(reads.brands).toHaveBeenCalledTimes(1);
  expect(reads.tags).toHaveBeenCalledTimes(1);
});

test("refreshing the product creation choices reads the brands and the tags again, and not the categories", async () => {
  const { reads, refresh } = await watchedChoices();

  await refresh.refresh();

  expect(reads.brands).toHaveBeenCalledTimes(2);
  expect(reads.tags).toHaveBeenCalledTimes(2);
  expect(reads.categories).toHaveBeenCalledTimes(1);
});
