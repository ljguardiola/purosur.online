import type {
  DiscountList,
  DiscountSummary,
  DiscountTargets,
  PriceList,
  PriceProduct,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchDiscounts, fetchDiscountTargets } from "./discounts-api";
import type { FetchPricesInput, fetchPrices } from "./prices-api";

export const pricesKey = ["prices"] as const;

export const pricesKeys = {
  list: ({ review, categoryId, search }: FetchPricesInput) =>
    [...pricesKey, "list", review, categoryId ?? null, search ?? null] as const,
  reviewQueue: [...pricesKey, "review-queue"] as const,
  reload: [...pricesKey, "reload"] as const,
};

export const discountsKey = [...pricesKey, "discounts"] as const;

export const discountTargetsKey = [...discountsKey, "targets"] as const;

export function usePricesQuery(params: {
  input: FetchPricesInput;
  fetchPrices: typeof fetchPrices;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PriceList>({
    queryKey: pricesKeys.list(params.input),
    keepPreviousData: true,
    read: () => params.fetchPrices(params.input),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReadReviewQueue(params: {
  fetchPrices: typeof fetchPrices;
}): () => Promise<CloudReadOutcome<PriceList>> {
  const client = useQueryClient();
  return () =>
    fetchCloudQuery(client, {
      queryKey: pricesKeys.reviewQueue,
      read: () => params.fetchPrices({ review: "pending" }),
    });
}

export type PriceReload =
  | { kind: "found"; product: PriceProduct }
  | { kind: "not_found" }
  | Exclude<CloudReadOutcome<never>, { kind: "ok" }>;

export function useReloadPrice(params: {
  fetchPrices: typeof fetchPrices;
}): (id: string) => Promise<PriceReload> {
  const client = useQueryClient();
  return async (id) => {
    void client.invalidateQueries({ queryKey: pricesKey });
    const listed = await fetchCloudQuery(client, {
      queryKey: pricesKeys.reload,
      read: () => params.fetchPrices({ review: "all" }),
    });
    if (listed.kind !== "ok") {
      return listed;
    }
    const product = listed.value.products.find((listedProduct) => listedProduct.id === id);
    return product ? { kind: "found", product } : { kind: "not_found" };
  };
}

export function useRefreshPrices(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: pricesKey });
}

export function useDiscountsQuery(params: {
  fetchDiscounts: typeof fetchDiscounts;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<DiscountList>({
    queryKey: discountsKey,
    read: params.fetchDiscounts,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useDiscountTargetsQuery(params: {
  fetchDiscountTargets: typeof fetchDiscountTargets;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<DiscountTargets>({
    queryKey: discountTargetsKey,
    read: params.fetchDiscountTargets,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshDiscounts(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: pricesKey });
}

export type DiscountReload =
  | { kind: "found"; discount: DiscountSummary }
  | { kind: "not_found" }
  | { kind: "list_failed" };

export function useReloadDiscount(params: {
  fetchDiscounts: typeof fetchDiscounts;
}): (id: string) => Promise<DiscountReload> {
  const client = useQueryClient();
  return async (id) => {
    void client.invalidateQueries({ queryKey: pricesKey });
    const listed = await fetchCloudQuery(client, {
      queryKey: discountsKey,
      read: params.fetchDiscounts,
    });
    if (listed.kind !== "ok") {
      return { kind: "list_failed" };
    }
    const discount = listed.value.discounts.find((listedDiscount) => listedDiscount.id === id);
    return discount ? { kind: "found", discount } : { kind: "not_found" };
  };
}
