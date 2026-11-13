import type {
  DiscountList,
  DiscountSummary,
  DiscountTargets,
  PriceList,
  PriceMargin,
  PriceProduct,
  PriceRecommendation,
  PricesPastReviewDeadlineReportBody,
  PricesPastReviewDeadlineReportQuery,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { combineCloudData } from "../platform/combine-cloud-data";
import { mapCloudData } from "../platform/map-cloud-data";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import { type CloudData, fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchDiscounts, fetchDiscountTargets } from "./discounts-api";
import type {
  FetchPriceRecommendationInput,
  FetchPricesInput,
  fetchPriceMargin,
  fetchPriceRecommendation,
  fetchPrices,
} from "./prices-api";
import type { fetchPricesPastReviewDeadlineReport } from "./prices-past-review-deadline-report-api";

export const pricingKey = ["pricing"] as const;

export const pricesKeys = {
  list: ({ review, categoryId, search }: FetchPricesInput) =>
    [...pricingKey, "list", review, categoryId ?? null, search ?? null] as const,
  reviewQueue: [...pricingKey, "review-queue"] as const,
  reviewQueueOf: (productIds: readonly string[]) =>
    [...pricingKey, "review-queue", ...productIds] as const,
  reload: [...pricingKey, "reload"] as const,
  ofProduct: (productId: string) => [...pricingKey, "product", productId] as const,
  pastReviewDeadlineReport: (query: PricesPastReviewDeadlineReportQuery) =>
    [...pricingKey, "past-review-deadline-report", query.from ?? "", query.to ?? ""] as const,
  margin: (productId: string, unitPrice: number | null) =>
    [...pricingKey, "margin", productId, unitPrice] as const,
  recommendation: (productId: string, components: string, unitPrice: number | null) =>
    [...pricingKey, "recommendation", productId, components, unitPrice] as const,
};

export const discountsKey = [...pricingKey, "discounts"] as const;

const DISCOUNT_STATUS_REFRESH_MS = 60_000;

export const discountTargetsKey = [...discountsKey, "targets"] as const;

const discountTargetsRereadKey = (form: string, opening: number) =>
  [...discountsKey, "targets-reread", form, opening] as const;

export function usePricesQuery(params: {
  input: FetchPricesInput;
  fetchPrices: typeof fetchPrices;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<PriceList>({
    queryKey: pricesKeys.list(params.input),
    keepPreviousData: true,
    read: () => params.fetchPrices(params.input),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

const PENDING_REVIEW: FetchPricesInput = { review: "pending" };

export function useProductPriceQuery(params: {
  productId: string;
  fetchPrices: typeof fetchPrices;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  const { productId } = params;
  return useCloudQuery<PriceProduct | null>({
    queryKey: pricesKeys.ofProduct(productId),
    read: async () => {
      const outcome = await params.fetchPrices({ review: "all", productIds: [productId] });
      return outcome.kind === "ok"
        ? {
            kind: "ok",
            value: outcome.value.products.find((product) => product.id === productId) ?? null,
          }
        : outcome;
    },
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function usePendingPricesCount(params: {
  enabled: boolean;
  fetchPrices: typeof fetchPrices;
  onSessionEnded: () => void;
}): CloudData<number> {
  return mapCloudData(
    useCloudQuery<PriceList>({
      queryKey: pricesKeys.list(PENDING_REVIEW),
      enabled: params.enabled,
      read: () => params.fetchPrices(PENDING_REVIEW),
      onSessionEnded: params.onSessionEnded,
    }),
    (prices) => prices.pendingCount,
  );
}

export function usePriceMarginQuery(params: {
  productId: string;
  unitPrice: number | undefined;
  fetchPriceMargin: typeof fetchPriceMargin;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  const { productId, unitPrice } = params;
  return useCloudQuery<PriceMargin>({
    queryKey: pricesKeys.margin(productId, unitPrice ?? null),
    enabled: unitPrice !== undefined,
    read: () =>
      unitPrice === undefined
        ? Promise.resolve({ kind: "failed" })
        : params.fetchPriceMargin(productId, unitPrice),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function usePriceRecommendationQuery(params: {
  productId: string;
  input: FetchPriceRecommendationInput;
  enabled: boolean;
  keepPreviousData: boolean;
  fetchPriceRecommendation: typeof fetchPriceRecommendation;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  const { productId, input } = params;
  const components = input.components
    .map(
      ({ componentProductId, quantityPerOutputUnit }) =>
        `${componentProductId}:${quantityPerOutputUnit}`,
    )
    .join(",");
  return useCloudQuery<PriceRecommendation>({
    queryKey: pricesKeys.recommendation(productId, components, input.unitPrice ?? null),
    enabled: params.enabled,
    keepPreviousData: params.keepPreviousData,
    read: () => params.fetchPriceRecommendation(productId, input),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useReadReviewQueue(params: {
  fetchPrices: typeof fetchPrices;
}): (productIds?: readonly string[]) => Promise<CloudReadOutcome<PriceList>> {
  const client = useQueryClient();
  return (productIds) =>
    productIds
      ? fetchCloudQuery(client, {
          queryKey: pricesKeys.reviewQueueOf(productIds),
          read: () => params.fetchPrices({ review: "pending", productIds }),
        })
      : fetchCloudQuery(client, {
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
    void client.invalidateQueries({ queryKey: pricingKey });
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

export function usePricesPastReviewDeadlineReportQuery(params: {
  query: PricesPastReviewDeadlineReportQuery;
  fetchPricesPastReviewDeadlineReport: typeof fetchPricesPastReviewDeadlineReport;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<PricesPastReviewDeadlineReportBody>({
    queryKey: pricesKeys.pastReviewDeadlineReport(params.query),
    keepPreviousData: true,
    read: () => params.fetchPricesPastReviewDeadlineReport(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useRefreshPrices(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: pricingKey });
}

function useDiscountsQuery(params: {
  fetchDiscounts: typeof fetchDiscounts;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<DiscountList>({
    queryKey: discountsKey,
    read: params.fetchDiscounts,
    refetchInterval: DISCOUNT_STATUS_REFRESH_MS,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

function useDiscountTargetsQuery(params: {
  fetchDiscountTargets: typeof fetchDiscountTargets;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<DiscountTargets>({
    queryKey: discountTargetsKey,
    read: params.fetchDiscountTargets,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useDiscountsWithTargetsQuery(params: {
  fetchDiscounts: typeof fetchDiscounts;
  fetchDiscountTargets: typeof fetchDiscountTargets;
  onSessionEnded: () => void;
}) {
  const discounts = useDiscountsQuery({
    fetchDiscounts: params.fetchDiscounts,
    onSessionEnded: params.onSessionEnded,
  });
  const targets = useDiscountTargetsQuery({
    fetchDiscountTargets: params.fetchDiscountTargets,
    onSessionEnded: params.onSessionEnded,
  });
  return combineCloudData(discounts, targets);
}

export function useRefreshDiscounts(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: pricingKey });
}

export function useMarkDiscountTargetsStale(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: discountTargetsKey, refetchType: "none" });
}

export function useDiscountTargetsReread(params: {
  opening: number;
  fetchDiscountTargets: typeof fetchDiscountTargets;
  onSessionEnded: () => void;
}): {
  reread: CloudData<DiscountTargets>;
  readAgain: () => Promise<CloudReadOutcome<DiscountTargets>>;
} {
  const client = useQueryClient();
  const sendToOwnAccount = useSendToOwnAccount();
  const queryKey = discountTargetsRereadKey(useId(), params.opening);
  const reread = useCloudQuery<DiscountTargets>({
    queryKey,
    enabled: false,
    read: params.fetchDiscountTargets,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
  return {
    reread,
    readAgain: () => fetchCloudQuery(client, { queryKey, read: params.fetchDiscountTargets }),
  };
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
    void client.invalidateQueries({ queryKey: pricingKey });
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
