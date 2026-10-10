import type {
  PackagingList,
  PackagingSummary,
  PurchaseChoices,
  PurchaseSummary,
  SupplierSummary,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchPackagings } from "./packagings-api";
import type { fetchPurchaseChoices, fetchPurchases } from "./purchases-api";
import type { fetchSuppliers } from "./suppliers-api";

export const purchasingKey = ["purchasing"] as const;

export const purchasingKeys = {
  suppliers: [...purchasingKey, "suppliers"] as const,
  packagings: [...purchasingKey, "packagings"] as const,
  purchases: [...purchasingKey, "purchases"] as const,
  purchaseChoices: [...purchasingKey, "purchase-choices"] as const,
};

export function useSuppliersQuery(params: {
  fetchSuppliers: typeof fetchSuppliers;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<SupplierSummary[]>({
    queryKey: purchasingKeys.suppliers,
    read: params.fetchSuppliers,
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
