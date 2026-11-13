import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { expect, type Mock, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { renderHook } from "vitest-browser-react";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { render } from "../shell/test-support/render-with-router";
import type { fetchPurchaseChanges, fetchPurchaseChoices } from "./purchases-api";
import {
  aiCostReportKey,
  freightReportKey,
  pendingPurchaseOrdersReportKey,
  purchasesReportKey,
  purchasingKey,
  purchasingKeys,
  receiptDifferencesReportKey,
  useProductCreationChoicesRefresh,
  usePurchaseChangesQuery,
  usePurchaseChoicesQuery,
  useRefreshSupplierItemLinkProposal,
  useRefreshSupplierItemQuantityProposal,
  useSupplierItemLinkProposalQuery,
  useSupplierItemQuantityProposalQuery,
  useSupplierPriceListAiCostQuery,
} from "./purchasing-queries";
import type {
  fetchSupplierItemLinkProposal,
  fetchSupplierItemQuantityProposal,
} from "./supplier-item-links-api";
import type { fetchSupplierPriceListAiCost } from "./supplier-price-lists-api";
import { LIST_AI_COST } from "./test-support/ai-cost";
import { purchaseChoicesFrom } from "./test-support/purchases";
import {
  NO_PROPOSAL,
  NO_QUANTITY_PROPOSAL,
  PROPOSED_BY_AI,
  PROPOSED_QUANTITY_OF_UNITS,
} from "./test-support/supplier-item-links";

test("invalidating the purchasing key marks the suppliers, the purchases, each purchase's changes, the purchase choices, the freights, the linkable purchases, the supplier price lists, each review, each list's AI cost, each proposal, each quantity proposal, the link choices, the categories a created product is filed under and the price comparison, each list of purchase orders, each purchase order, each purchases report, each pending purchase orders report, each receipt differences report, each freight report and each AI cost report stale", async () => {
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
    pendingPurchaseOrdersReportKey({ from: "2026-10-01", to: "2026-10-07" }),
    receiptDifferencesReportKey({ from: "2026-10-01", to: "2026-10-07" }),
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

test.each([
  { part: "start", changed: { from: "2026-10-02" } },
  { part: "end", changed: { to: "2026-10-08" } },
])(
  "a pending purchase orders report differing only in its $part has its own key",
  ({ changed }) => {
    const query = { from: "2026-10-01", to: "2026-10-07" };

    expect(pendingPurchaseOrdersReportKey({ ...query, ...changed })).not.toEqual(
      pendingPurchaseOrdersReportKey(query),
    );
  },
);

test("a pending purchase orders report and a purchases report of the same range have their own keys", () => {
  const query = { from: "2026-10-01", to: "2026-10-07" };

  expect(pendingPurchaseOrdersReportKey(query)).not.toEqual(purchasesReportKey(query));
});

test.each([
  { part: "start", changed: { from: "2026-10-02" } },
  { part: "end", changed: { to: "2026-10-08" } },
])("a receipt differences report differing only in its $part has its own key", ({ changed }) => {
  const query = { from: "2026-10-01", to: "2026-10-07" };

  expect(receiptDifferencesReportKey({ ...query, ...changed })).not.toEqual(
    receiptDifferencesReportKey(query),
  );
});

test("a receipt differences report and a pending purchase orders report of the same range have their own keys", () => {
  const query = { from: "2026-10-01", to: "2026-10-07" };

  expect(receiptDifferencesReportKey(query)).not.toEqual(pendingPurchaseOrdersReportKey(query));
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

type Refresh = {
  refresh: () => Promise<{ kind: string } | null>;
  refreshing: boolean;
  failed: boolean;
};

function RefreshHarness({
  shown,
  refresh,
}: {
  shown: { status: string; value?: { kind: string } };
  refresh: Refresh;
}) {
  const [answer, setAnswer] = useState("nothing yet");
  return (
    <>
      <p>shown: {shown.status === "loaded" ? shown.value?.kind : shown.status}</p>
      <p>{refresh.refreshing ? "refreshing" : "not refreshing"}</p>
      <p>{refresh.failed ? "refresh failed" : "refresh did not fail"}</p>
      <p>answer: {answer}</p>
      <button
        type="button"
        onClick={async () => {
          const outcome = await refresh.refresh();
          setAnswer(outcome === null ? "dropped" : outcome.kind);
        }}
      >
        Volver a proponer
      </button>
    </>
  );
}

type HarnessProps = {
  opening: object;
  fetchAiCost: typeof fetchSupplierPriceListAiCost;
  onSessionEnded: () => void;
};

function LinkProposalRefresh({
  opening,
  fetchAiCost,
  onSessionEnded,
  fetchProposal,
}: HarnessProps & { fetchProposal: typeof fetchSupplierItemLinkProposal }) {
  useSupplierPriceListAiCostQuery({
    listId: "list-1",
    fetchSupplierPriceListAiCost: fetchAiCost,
    onSessionEnded,
  });
  const shown = useSupplierItemLinkProposalQuery({
    listId: "list-1",
    rowId: "row-1",
    enabled: true,
    fetchSupplierItemLinkProposal: fetchProposal,
    onSessionEnded,
  });
  const refresh = useRefreshSupplierItemLinkProposal({
    listId: "list-1",
    rowId: "row-1",
    opening,
    fetchSupplierItemLinkProposal: fetchProposal,
    onSessionEnded,
  });
  return <RefreshHarness shown={shown} refresh={refresh} />;
}

const QUANTITY_REQUEST = { saleUnit: "UNIT", netContent: null, refresh: false } as const;

function QuantityProposalRefresh({
  opening,
  fetchAiCost,
  onSessionEnded,
  fetchProposal,
}: HarnessProps & { fetchProposal: typeof fetchSupplierItemQuantityProposal }) {
  useSupplierPriceListAiCostQuery({
    listId: "list-1",
    fetchSupplierPriceListAiCost: fetchAiCost,
    onSessionEnded,
  });
  const shown = useSupplierItemQuantityProposalQuery({
    listId: "list-1",
    rowId: "row-1",
    request: QUANTITY_REQUEST,
    fetchSupplierItemQuantityProposal: fetchProposal,
    onSessionEnded,
  });
  const refresh = useRefreshSupplierItemQuantityProposal({
    listId: "list-1",
    rowId: "row-1",
    opening,
    request: QUANTITY_REQUEST,
    fetchSupplierItemQuantityProposal: fetchProposal,
    onSessionEnded,
  });
  return <RefreshHarness shown={shown} refresh={refresh} />;
}

type SharedAnswer = CloudReadOutcome<never>;
type Mounted = {
  fetchProposal: ReturnType<typeof vi.fn>;
  element: (opening: object) => ReactNode;
};

function answeringInTurn<T>(
  read: Mock<(...args: never[]) => Promise<CloudReadOutcome<T>>>,
  first: T,
  answers: (CloudReadOutcome<T> | Promise<CloudReadOutcome<T>>)[],
) {
  read.mockResolvedValueOnce({ kind: "ok", value: first });
  for (const answer of answers) {
    read.mockReturnValueOnce(Promise.resolve(answer));
  }
}

const refreshedHooks = [
  {
    name: "link",
    firstShown: NO_PROPOSAL.kind,
    renewedShown: PROPOSED_BY_AI.kind,
    refreshBody: { refresh: true },
    mount: (
      props: Omit<HarnessProps, "opening">,
      answers: (SharedAnswer | Promise<SharedAnswer> | "renewed" | Promise<"renewed">)[],
    ): Mounted => {
      const fetchProposal = vi.fn<typeof fetchSupplierItemLinkProposal>();
      answeringInTurn(
        fetchProposal,
        NO_PROPOSAL,
        answers.map((answer) => renewedAs(answer, { kind: "ok", value: PROPOSED_BY_AI })),
      );
      return {
        fetchProposal,
        element: (opening) => (
          <LinkProposalRefresh {...props} opening={opening} fetchProposal={fetchProposal} />
        ),
      };
    },
  },
  {
    name: "quantity",
    firstShown: NO_QUANTITY_PROPOSAL.kind,
    renewedShown: PROPOSED_QUANTITY_OF_UNITS.kind,
    refreshBody: { ...QUANTITY_REQUEST, refresh: true },
    mount: (
      props: Omit<HarnessProps, "opening">,
      answers: (SharedAnswer | Promise<SharedAnswer> | "renewed" | Promise<"renewed">)[],
    ): Mounted => {
      const fetchProposal = vi.fn<typeof fetchSupplierItemQuantityProposal>();
      answeringInTurn(
        fetchProposal,
        NO_QUANTITY_PROPOSAL,
        answers.map((answer) =>
          renewedAs(answer, { kind: "ok", value: PROPOSED_QUANTITY_OF_UNITS }),
        ),
      );
      return {
        fetchProposal,
        element: (opening) => (
          <QuantityProposalRefresh {...props} opening={opening} fetchProposal={fetchProposal} />
        ),
      };
    },
  },
];

function renewedAs<T>(
  answer: SharedAnswer | Promise<SharedAnswer> | "renewed" | Promise<"renewed">,
  renewed: CloudReadOutcome<T>,
): Promise<CloudReadOutcome<T>> {
  return Promise.resolve(answer).then((settled) => (settled === "renewed" ? renewed : settled));
}

async function refreshing(
  hook: (typeof refreshedHooks)[number],
  ...answers: (SharedAnswer | Promise<SharedAnswer> | "renewed" | Promise<"renewed">)[]
) {
  const fetchAiCost = vi
    .fn<typeof fetchSupplierPriceListAiCost>()
    .mockResolvedValue({ kind: "ok", value: LIST_AI_COST });
  const onSessionEnded = vi.fn();
  const { fetchProposal, element } = hook.mount({ fetchAiCost, onSessionEnded }, answers);
  const screen = await render(element({}));
  await expect.element(screen.getByText(`shown: ${hook.firstShown}`)).toBeVisible();
  await expect.poll(() => fetchAiCost.mock.calls.length).toBeGreaterThan(0);
  const reopen = () => screen.rerender(element({}));
  const askAgain = () => userEvent.click(screen.getByRole("button", { name: "Volver a proponer" }));
  return { screen, fetchProposal, fetchAiCost, onSessionEnded, reopen, askAgain };
}

test.each(refreshedHooks)(
  "refreshing the $name proposal asks the cloud again and shows its answer in place of the one read",
  async (hook) => {
    const { screen, fetchProposal, askAgain } = await refreshing(hook, "renewed");

    await askAgain();

    await expect.element(screen.getByText(`shown: ${hook.renewedShown}`)).toBeVisible();
    expect(fetchProposal).toHaveBeenLastCalledWith("list-1", "row-1", hook.refreshBody);
    expect(fetchProposal).toHaveBeenCalledTimes(2);
  },
);

test.each(refreshedHooks)(
  "refreshing the $name proposal reads the list's AI cost again",
  async (hook) => {
    const { fetchAiCost, askAgain } = await refreshing(hook, "renewed");
    const readsBefore = fetchAiCost.mock.calls.length;

    await askAgain();

    await expect.poll(() => fetchAiCost.mock.calls.length).toBeGreaterThan(readsBefore);
  },
);

test.each(
  refreshedHooks.flatMap((hook) => [
    { ...hook, outcome: { kind: "failed" } as const },
    { ...hook, outcome: { kind: "rate_limited", retryAfterSeconds: 30 } as const },
  ]),
)(
  "refreshing the $name proposal tells it failed when the cloud answers $outcome.kind, keeping the one read",
  async (hook) => {
    const { screen, askAgain } = await refreshing(hook, hook.outcome);

    await askAgain();

    await expect.element(screen.getByText("refresh failed")).toBeVisible();
    await expect.element(screen.getByText(`shown: ${hook.firstShown}`)).toBeVisible();
  },
);

test.each(refreshedHooks)(
  "refreshing the $name proposal tells no failure once it succeeds",
  async (hook) => {
    const { screen, askAgain } = await refreshing(hook, "renewed");

    await askAgain();

    await expect.element(screen.getByText(`answer: ok`)).toBeVisible();
    await expect.element(screen.getByText("refresh did not fail")).toBeVisible();
  },
);

test.each(refreshedHooks)(
  "refreshing the $name proposal opens the own account panel when it comes back forbidden",
  async (hook) => {
    window.history.pushState(null, "", "/supplier-price-lists/list-1");
    const { askAgain } = await refreshing(hook, { kind: "forbidden" });

    await askAgain();

    await expect
      .poll(() => window.location.pathname + window.location.search)
      .toBe("/?account=credentials");
  },
);

test.each(refreshedHooks)(
  "refreshing the $name proposal ends the session when it comes back unauthenticated",
  async (hook) => {
    const { onSessionEnded, askAgain } = await refreshing(hook, { kind: "unauthenticated" });

    await askAgain();

    await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
  },
);

test.each(refreshedHooks)(
  "a new opening forgets that refreshing the $name proposal failed",
  async (hook) => {
    const { screen, reopen, askAgain } = await refreshing(hook, { kind: "failed" });
    await askAgain();
    await expect.element(screen.getByText("refresh failed")).toBeVisible();

    await reopen();

    await expect.element(screen.getByText("refresh did not fail")).toBeVisible();
  },
);

test.each(refreshedHooks)(
  "an answer to refreshing the $name proposal that arrives after a new opening is dropped",
  async (hook) => {
    let settle: (answer: "renewed") => void = () => {};
    const late = new Promise<"renewed">((resolve) => {
      settle = resolve;
    });
    const { screen, reopen, askAgain } = await refreshing(hook, late);
    await askAgain();
    await expect.element(screen.getByText("refreshing", { exact: true })).toBeVisible();

    await reopen();
    settle("renewed");

    await expect.element(screen.getByText("answer: dropped")).toBeVisible();
    await expect.element(screen.getByText("not refreshing")).toBeVisible();
  },
);
