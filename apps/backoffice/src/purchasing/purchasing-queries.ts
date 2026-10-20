import type {
  FreightList,
  LinkablePurchaseList,
  PackagingList,
  PackagingSummary,
  PurchaseChoices,
  PurchaseSummary,
  SupplierPriceListSummary,
  SupplierSummary,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { type CloudData, fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type {
  FetchFreightsInput,
  FetchLinkablePurchasesInput,
  fetchFreights,
  fetchLinkablePurchases,
} from "./freights-api";
import type { fetchPackagings } from "./packagings-api";
import type { fetchPurchaseChoices, fetchPurchases } from "./purchases-api";
import type {
  fetchSupplierPriceListReview,
  fetchSupplierPriceLists,
  SupplierPriceListReviewRead,
} from "./supplier-price-lists-api";
import type { fetchSuppliers } from "./suppliers-api";

export const purchasingKey = ["purchasing"] as const;

export const purchasingKeys = {
  suppliers: [...purchasingKey, "suppliers"] as const,
  packagings: [...purchasingKey, "packagings"] as const,
  purchases: [...purchasingKey, "purchases"] as const,
  purchaseChoices: [...purchasingKey, "purchase-choices"] as const,
  freights: [...purchasingKey, "freights"] as const,
  linkablePurchases: [...purchasingKey, "linkable-purchases"] as const,
  supplierPriceLists: [...purchasingKey, "supplier-price-lists"] as const,
  supplierPriceListReview: [...purchasingKey, "supplier-price-list-review"] as const,
};

const SUPPLIER_PRICE_LIST_READING_REFRESH_MS = 5_000;

function useCloudQueryWhileReading<T>(
  query: Omit<Parameters<typeof useCloudQuery<T>>[0], "refetchInterval">,
  isReading: (value: T) => boolean,
): CloudData<T> {
  const [reading, setReading] = useState(false);
  const data = useCloudQuery<T>({
    ...query,
    ...(reading ? { refetchInterval: SUPPLIER_PRICE_LIST_READING_REFRESH_MS } : {}),
  });
  if (data.status === "loaded" && isReading(data.value) !== reading) {
    setReading(!reading);
  }
  return data;
}

export function useSuppliersQuery(params: {
  fetchSuppliers: typeof fetchSuppliers;
  enabled?: boolean;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SupplierSummary[]>({
    queryKey: purchasingKeys.suppliers,
    read: params.fetchSuppliers,
    enabled: params.enabled ?? true,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function usePackagingsQuery(params: {
  fetchPackagings: typeof fetchPackagings;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PackagingList>({
    queryKey: purchasingKeys.packagings,
    read: params.fetchPackagings,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function usePurchasesQuery(params: {
  fetchPurchases: typeof fetchPurchases;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PurchaseSummary[]>({
    queryKey: purchasingKeys.purchases,
    read: params.fetchPurchases,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function usePurchaseChoicesQuery(params: {
  fetchPurchaseChoices: typeof fetchPurchaseChoices;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PurchaseChoices>({
    queryKey: purchasingKeys.purchaseChoices,
    read: params.fetchPurchaseChoices,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useFreightsQuery(params: {
  input: FetchFreightsInput;
  fetchFreights: typeof fetchFreights;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<FreightList>({
    queryKey: [...purchasingKeys.freights, params.input],
    keepPreviousData: true,
    read: () => params.fetchFreights(params.input),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useLinkablePurchasesQuery(params: {
  input: FetchLinkablePurchasesInput;
  enabled: boolean;
  fetchLinkablePurchases: typeof fetchLinkablePurchases;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<LinkablePurchaseList>({
    queryKey: [...purchasingKeys.linkablePurchases, params.input],
    enabled: params.enabled,
    read: () => params.fetchLinkablePurchases(params.input),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useSupplierPriceListsQuery(params: {
  fetchSupplierPriceLists: typeof fetchSupplierPriceLists;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQueryWhileReading<SupplierPriceListSummary[]>(
    {
      queryKey: purchasingKeys.supplierPriceLists,
      read: params.fetchSupplierPriceLists,
      onSessionEnded: params.onSessionEnded,
      onForbidden: sendToMyAccount,
    },
    (lists) => lists.some((list) => list.state === "READING"),
  );
}

export function useSupplierPriceListReviewQuery(params: {
  listId: string;
  fetchSupplierPriceListReview: typeof fetchSupplierPriceListReview;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQueryWhileReading<SupplierPriceListReviewRead>(
    {
      queryKey: [...purchasingKeys.supplierPriceListReview, params.listId],
      read: () => params.fetchSupplierPriceListReview(params.listId),
      onSessionEnded: params.onSessionEnded,
      onForbidden: sendToMyAccount,
    },
    (read) => read.kind === "found" && read.review.list.state === "READING",
  );
}

export function useRefreshPurchasing(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: purchasingKey });
}

export type SupplierReload =
  | { kind: "found"; supplier: SupplierSummary }
  | { kind: "not_found" }
  | { kind: "list_failed" };

export function useReloadSupplier(params: {
  fetchSuppliers: typeof fetchSuppliers;
}): (id: string) => Promise<SupplierReload> {
  const client = useQueryClient();
  return async (id) => {
    void client.invalidateQueries({ queryKey: purchasingKey });
    const listed = await fetchCloudQuery(client, {
      queryKey: purchasingKeys.suppliers,
      read: params.fetchSuppliers,
    });
    if (listed.kind !== "ok") {
      return { kind: "list_failed" };
    }
    const supplier = listed.value.find((listedSupplier) => listedSupplier.id === id);
    return supplier ? { kind: "found", supplier } : { kind: "not_found" };
  };
}

export type PackagingReload =
  | { kind: "found"; packaging: PackagingSummary }
  | { kind: "not_found" }
  | { kind: "list_failed" };

export function useReloadPackaging(params: {
  fetchPackagings: typeof fetchPackagings;
}): (id: string) => Promise<PackagingReload> {
  const client = useQueryClient();
  return async (id) => {
    void client.invalidateQueries({ queryKey: purchasingKey });
    const listed = await fetchCloudQuery(client, {
      queryKey: purchasingKeys.packagings,
      read: params.fetchPackagings,
    });
    if (listed.kind !== "ok") {
      return { kind: "list_failed" };
    }
    const packaging = listed.value.packagings.find((listed) => listed.id === id);
    return packaging ? { kind: "found", packaging } : { kind: "not_found" };
  };
}
