import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { render } from "../shell/test-support/render-with-router";
import type { fetchPurchaseChanges, fetchPurchaseChoices } from "./purchases-api";
import {
  aiCostReportKey,
  freightReportKey,
  purchasesReportKey,
  purchasingKey,
  purchasingKeys,
  useProductCreationChoicesRefresh,
  usePurchaseChangesQuery,
  usePurchaseChoicesQuery,
} from "./purchasing-queries";
import { purchaseChoicesFrom } from "./test-support/purchases";

test("invalidating the purchasing key marks the suppliers, the purchases, each purchase's changes, the purchase choices, the freights, the linkable purchases, the supplier price lists, each review, each list's AI cost, each proposal, each quantity proposal, the link choices, the categories a created product is filed under and the price comparison, each list of purchase orders, each purchase order, each purchases report, each freight report and each AI cost report stale", async () => {
  const client = new QueryClient();
  const keys = [
    purchasingKeys.suppliers,
    purchasingKeys.purchases,
    [...purchasingKeys.purchaseChanges, "purchase-1"],
    purchasingKeys.purchaseChoices,
    purchasingKeys.freights,
    purchasingKeys.linkablePurchases,
    purchasingKeys.supplierPriceLists,
    [...purchasingKeys.supplierPriceListReview, "list-1"],
    [...purchasingKeys.supplierPriceListAiCost, "list-1"],
    [...purchasingKeys.supplierItemLinkProposal, "list-1", "row-1"],
    [...purchasingKeys.supplierItemQuantityProposal, "list-1", "row-1", "UNIT"],
    purchasingKeys.supplierItemLinkChoices,
    purchasingKeys.productCreationCategories,
    purchasingKeys.supplierPriceComparison,
    [...purchasingKeys.purchaseOrders, "ALL"],
    [...purchasingKeys.purchaseOrder, "order-1"],
    purchasesReportKey({ from: "2026-10-01", to: "2026-10-07" }),
    freightReportKey({ from: "2026-10-01", to: "2026-10-07" }),
    aiCostReportKey({ from: "2026-10-01", to: "2026-10-07", group_by: "supplier" }),
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

test.each([
  { part: "start", changed: { from: "2026-10-02" } },
  { part: "end", changed: { to: "2026-10-08" } },
])("a freight report differing only in its $part has its own key", ({ changed }) => {
  const query = { from: "2026-10-01", to: "2026-10-07" };

  expect(freightReportKey({ ...query, ...changed })).not.toEqual(freightReportKey(query));
});

test("a freight report and a purchases report of the same range have their own keys", () => {
  const query = { from: "2026-10-01", to: "2026-10-07" };

  expect(freightReportKey(query)).not.toEqual(purchasesReportKey(query));
});

test.each([
  { part: "start", changed: { from: "2026-10-02" } },
  { part: "end", changed: { to: "2026-10-08" } },
  { part: "grouping", changed: { group_by: "person" as const } },
])("an AI cost report differing only in its $part has its own key", ({ changed }) => {
  const query = { from: "2026-10-01", to: "2026-10-07", group_by: "supplier" as const };

  expect(aiCostReportKey({ ...query, ...changed })).not.toEqual(aiCostReportKey(query));
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

test("marking the product creation choices stale marks the brands, the tags and the categories out of date without reading them", async () => {
  const { client, reads, refresh } = await watchedChoices();

  await refresh.markStale();

  expect(client.getQueryState(purchasingKeys.productCreationBrands)?.isInvalidated).toBe(true);
  expect(client.getQueryState(purchasingKeys.productCreationTags)?.isInvalidated).toBe(true);
  expect(client.getQueryState(purchasingKeys.productCreationCategories)?.isInvalidated).toBe(true);
  expect(reads.brands).toHaveBeenCalledTimes(1);
  expect(reads.tags).toHaveBeenCalledTimes(1);
  expect(reads.categories).toHaveBeenCalledTimes(1);
});

test("refreshing the product creation choices reads the brands, the tags and the categories again", async () => {
  const { reads, refresh } = await watchedChoices();

  await refresh.refresh();

  expect(reads.brands).toHaveBeenCalledTimes(2);
  expect(reads.tags).toHaveBeenCalledTimes(2);
  expect(reads.categories).toHaveBeenCalledTimes(2);
});

function PurchaseChoicesStatus({
  read,
  enabled,
}: {
  read: typeof fetchPurchaseChoices;
  enabled?: boolean;
}) {
  const choices = usePurchaseChoicesQuery({
    fetchPurchaseChoices: read,
    ...(enabled === undefined ? {} : { enabled }),
    onSessionEnded: () => {},
  });
  return <p>{choices.status}</p>;
}

test("the purchase choices are not read while they are not wanted, and are read once they are", async () => {
  const read = vi
    .fn<typeof fetchPurchaseChoices>()
    .mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) });
  const screen = await render(<PurchaseChoicesStatus read={read} enabled={false} />);

  await expect.element(screen.getByText("loading")).toBeVisible();
  expect(read).not.toHaveBeenCalled();

  await screen.rerender(<PurchaseChoicesStatus read={read} enabled />);

  await expect.element(screen.getByText("loaded")).toBeVisible();
  expect(read).toHaveBeenCalledTimes(1);
});

test("the purchase choices are read when nothing says whether they are wanted", async () => {
  const read = vi
    .fn<typeof fetchPurchaseChoices>()
    .mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) });
  const screen = await render(<PurchaseChoicesStatus read={read} />);

  await expect.element(screen.getByText("loaded")).toBeVisible();
  expect(read).toHaveBeenCalledTimes(1);
});

function PurchaseChangesStatus({
  purchaseId,
  read,
}: {
  purchaseId: string | null;
  read: typeof fetchPurchaseChanges;
}) {
  const changes = usePurchaseChangesQuery({
    purchaseId,
    fetchPurchaseChanges: read,
    onSessionEnded: () => {},
  });
  return <p>{changes.status}</p>;
}

test("a purchase's changes are not read without a purchase, and are read for the purchase once there is one", async () => {
  const read = vi.fn<typeof fetchPurchaseChanges>().mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<PurchaseChangesStatus purchaseId={null} read={read} />);

  await expect.element(screen.getByText("loading")).toBeVisible();
  expect(read).not.toHaveBeenCalled();

  await screen.rerender(<PurchaseChangesStatus purchaseId="purchase-1" read={read} />);

  await expect.element(screen.getByText("loaded")).toBeVisible();
  expect(read.mock.calls).toEqual([["purchase-1"]]);
});
