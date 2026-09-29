import type { BrandSummary, CategorySummary, ProductSummary } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchBrands } from "./brands-api";
import type { fetchCategories } from "./categories-api";
import type { fetchProducts, ProductStatusFilter } from "./products-api";

export const catalogKey = ["catalog"] as const;

export const catalogKeys = {
  categories: [...catalogKey, "categories"] as const,
  brands: [...catalogKey, "brands"] as const,
  products: (status: ProductStatusFilter) => [...catalogKey, "products", status] as const,
};

export function useCategoriesQuery(params: {
  fetchCategories: typeof fetchCategories;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<CategorySummary[]>({
    queryKey: catalogKeys.categories,
    read: params.fetchCategories,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useBrandsQuery(params: {
  fetchBrands: typeof fetchBrands;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<BrandSummary[]>({
    queryKey: catalogKeys.brands,
    read: params.fetchBrands,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useProductsQuery(params: {
  status: ProductStatusFilter;
  fetchProducts: typeof fetchProducts;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ProductSummary[]>({
    queryKey: catalogKeys.products(params.status),
    read: () => params.fetchProducts(params.status),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export type CategoryReload =
  | { kind: "found"; category: CategorySummary }
  | { kind: "not_found" }
  | { kind: "list_failed" };

export function useReloadCategory(params: {
  fetchCategories: typeof fetchCategories;
}): (id: string) => Promise<CategoryReload> {
  const client = useQueryClient();
  return async (id) => {
    void client.invalidateQueries({ queryKey: catalogKey });
    const listed = await fetchCloudQuery(client, {
      queryKey: catalogKeys.categories,
      read: params.fetchCategories,
    });
    if (listed.kind !== "ok") {
      return { kind: "list_failed" };
    }
    const category = listed.value.find((listedCategory) => listedCategory.id === id);
    return category ? { kind: "found", category } : { kind: "not_found" };
  };
}

export type BrandReload =
  | { kind: "found"; brand: BrandSummary }
  | { kind: "not_found" }
  | { kind: "list_failed" };

export function useReloadBrand(params: {
  fetchBrands: typeof fetchBrands;
}): (id: string) => Promise<BrandReload> {
  const client = useQueryClient();
  return async (id) => {
    void client.invalidateQueries({ queryKey: catalogKey });
    const listed = await fetchCloudQuery(client, {
      queryKey: catalogKeys.brands,
      read: params.fetchBrands,
    });
    if (listed.kind !== "ok") {
      return { kind: "list_failed" };
    }
    const brand = listed.value.find((listedBrand) => listedBrand.id === id);
    return brand ? { kind: "found", brand } : { kind: "not_found" };
  };
}

export type ProductReload =
  | { kind: "found"; product: ProductSummary }
  | { kind: "not_found" }
  | { kind: "list_failed" }
  | Exclude<CloudReadOutcome<never>, { kind: "ok" }>;

export function useReloadProduct(params: {
  status: ProductStatusFilter;
  fetchProducts: typeof fetchProducts;
}): (id: string) => Promise<ProductReload> {
  const client = useQueryClient();
  const readProducts = (status: ProductStatusFilter) =>
    fetchCloudQuery(client, {
      queryKey: catalogKeys.products(status),
      read: () => params.fetchProducts(status),
    });
  return async (id) => {
    void client.invalidateQueries({ queryKey: catalogKey });
    const listed = await readProducts(params.status);
    if (listed.kind !== "ok") {
      return { kind: "list_failed" };
    }
    const listedProduct = listed.value.find((product) => product.id === id);
    if (listedProduct) {
      return { kind: "found", product: listedProduct };
    }
    if (params.status === "all") {
      return { kind: "not_found" };
    }
    const every = await readProducts("all");
    if (every.kind !== "ok") {
      return every;
    }
    const product = every.value.find((everyProduct) => everyProduct.id === id);
    return product ? { kind: "found", product } : { kind: "not_found" };
  };
}

export function useRefreshCatalog(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: catalogKey });
}
