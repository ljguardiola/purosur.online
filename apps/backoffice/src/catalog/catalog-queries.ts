import type { CategorySummary, ProductSummary } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchCategories } from "./categories-api";
import type { fetchProducts, ProductStatusFilter } from "./products-api";

export const catalogKey = ["catalog"] as const;

export const catalogKeys = {
  categories: [...catalogKey, "categories"] as const,
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

export function useRefreshCatalog(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: catalogKey });
}
