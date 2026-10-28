import type {
  BrandSummary,
  CategorySummary,
  FreightList,
  LinkablePurchaseList,
  PackagingList,
  PackagingSummary,
  PurchaseChoices,
  PurchaseSummary,
  SupplierItemLinkChoices,
  SupplierItemLinkProposal,
  SupplierPriceComparison,
  SupplierPriceListSummary,
  SupplierSummary,
  TagList,
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
  fetchSupplierItemLinkChoices,
  fetchSupplierItemLinkProposal,
} from "./supplier-item-links-api";
import type {
  fetchProductCreationBrands,
  fetchProductCreationCategories,
  fetchProductCreationTags,
} from "./supplier-item-products-api";
import type { fetchSupplierPriceComparison } from "./supplier-price-comparison-api";
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
  supplierItemLinkProposal: [...purchasingKey, "supplier-item-link-proposal"] as const,
  supplierItemLinkChoices: [...purchasingKey, "supplier-item-link-choices"] as const,
  productCreationCategories: [...purchasingKey, "product-creation-categories"] as const,
  productCreationBrands: [...purchasingKey, "product-creation-brands"] as const,
  productCreationTags: [...purchasingKey, "product-creation-tags"] as const,
  supplierPriceComparison: [...purchasingKey, "supplier-price-comparison"] as const,
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

export function useSupplierItemLinkProposalQuery(params: {
  listId: string;
  rowId: string;
  enabled: boolean;
  fetchSupplierItemLinkProposal: typeof fetchSupplierItemLinkProposal;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SupplierItemLinkProposal>({
    queryKey: [...purchasingKeys.supplierItemLinkProposal, params.listId, params.rowId],
    enabled: params.enabled,
    read: () => params.fetchSupplierItemLinkProposal(params.listId, params.rowId),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useSupplierItemLinkChoicesQuery(params: {
  enabled: boolean;
  fetchSupplierItemLinkChoices: typeof fetchSupplierItemLinkChoices;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SupplierItemLinkChoices>({
    queryKey: purchasingKeys.supplierItemLinkChoices,
    enabled: params.enabled,
    read: params.fetchSupplierItemLinkChoices,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useProductCreationCategoriesQuery(params: {
  enabled: boolean;
  fetchProductCreationCategories: typeof fetchProductCreationCategories;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<CategorySummary[]>({
    queryKey: purchasingKeys.productCreationCategories,
    enabled: params.enabled,
    read: params.fetchProductCreationCategories,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useProductCreationBrandsQuery(params: {
  enabled: boolean;
  fetchProductCreationBrands: typeof fetchProductCreationBrands;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<BrandSummary[]>({
    queryKey: purchasingKeys.productCreationBrands,
    enabled: params.enabled,
    read: params.fetchProductCreationBrands,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useProductCreationTagsQuery(params: {
  enabled: boolean;
  fetchProductCreationTags: typeof fetchProductCreationTags;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<TagList>({
    queryKey: purchasingKeys.productCreationTags,
    enabled: params.enabled,
    read: params.fetchProductCreationTags,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useProductCreationChoicesRefresh() {
  const client = useQueryClient();
  return {
    markStale: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: purchasingKeys.productCreationBrands,
          refetchType: "none",
        }),
        client.invalidateQueries({
          queryKey: purchasingKeys.productCreationTags,
          refetchType: "none",
        }),
      ]);
    },
    refresh: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: purchasingKeys.productCreationBrands }),
        client.invalidateQueries({ queryKey: purchasingKeys.productCreationTags }),
      ]);
    },
  };
}

export function useSupplierPriceComparisonQuery(params: {
  fetchSupplierPriceComparison: typeof fetchSupplierPriceComparison;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SupplierPriceComparison>({
    queryKey: purchasingKeys.supplierPriceComparison,
    read: params.fetchSupplierPriceComparison,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshSupplierItemLinkChoices(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: purchasingKeys.supplierItemLinkChoices });
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
