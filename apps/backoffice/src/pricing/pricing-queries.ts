import type { PriceList, PriceProduct } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { FetchPricesInput, fetchPrices } from "./prices-api";

export const pricesKey = ["prices"] as const;

export const pricesKeys = {
  list: ({ review, categoryId, search }: FetchPricesInput) =>
    [...pricesKey, "list", review, categoryId ?? null, search ?? null] as const,
  reviewQueue: [...pricesKey, "review-queue"] as const,
  reload: [...pricesKey, "reload"] as const,
};

export type PricesRead = PriceList & { readAt: Date };

function readPrices(params: {
  fetchPrices: typeof fetchPrices;
  now: () => Date;
  input: FetchPricesInput;
}): () => Promise<CloudReadOutcome<PricesRead>> {
  return async () => {
    const outcome = await params.fetchPrices(params.input);
    return outcome.kind === "ok"
      ? { kind: "ok", value: { ...outcome.value, readAt: params.now() } }
      : outcome;
  };
}

export function usePricesQuery(params: {
  input: FetchPricesInput;
  fetchPrices: typeof fetchPrices;
  now: () => Date;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PricesRead>({
    queryKey: pricesKeys.list(params.input),
    keepPreviousData: true,
    read: readPrices(params),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReadReviewQueue(params: {
  fetchPrices: typeof fetchPrices;
  now: () => Date;
}): () => Promise<CloudReadOutcome<PricesRead>> {
  const client = useQueryClient();
  return () =>
    fetchCloudQuery(client, {
      queryKey: pricesKeys.reviewQueue,
      read: readPrices({ ...params, input: { review: "pending" } }),
    });
}

export type PriceReload =
  | { kind: "found"; product: PriceProduct }
  | { kind: "not_found" }
  | Exclude<CloudReadOutcome<never>, { kind: "ok" }>;

export function useReloadPrice(params: {
  fetchPrices: typeof fetchPrices;
  now: () => Date;
}): (id: string) => Promise<PriceReload> {
  const client = useQueryClient();
  return async (id) => {
    void client.invalidateQueries({ queryKey: pricesKey });
    const listed = await fetchCloudQuery(client, {
      queryKey: pricesKeys.reload,
      read: readPrices({ ...params, input: { review: "all" } }),
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
