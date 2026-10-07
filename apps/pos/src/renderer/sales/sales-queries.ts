import type {
  CashChargeAnswer,
  CurrentSaleAnswer,
  OpenSale,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { setQueryAnswer } from "../platform/set-query-answer";
import type { CoreData } from "../platform/use-core-query";
import { useCoreQuery } from "../platform/use-core-query";

const salesKey = ["sales"] as const;

export const salesKeys = {
  currentSaleRoot: [...salesKey, "current-sale"] as const,
  currentSale: (sessionId: string, userId: string) =>
    [...salesKey, "current-sale", sessionId, userId] as const,
  cashCharge: (saleId: string, pending: number, tendered: number | undefined) =>
    [...salesKey, "cash-charge", saleId, pending, tendered ?? null] as const,
  search: (query: string) => [...salesKey, "search", query] as const,
};

export function useCurrentSaleQuery({
  sessionId,
  userId,
  read,
}: {
  sessionId: string;
  userId: string;
  read: () => Promise<CurrentSaleAnswer>;
}): CoreData<CurrentSaleAnswer> {
  return useCoreQuery({ queryKey: salesKeys.currentSale(sessionId, userId), read });
}

export function useCashChargeQuery({
  saleId,
  pending,
  tendered,
  read,
}: {
  saleId: string;
  pending: number;
  tendered: number | undefined;
  read: (tendered: number) => Promise<CashChargeAnswer>;
}): CoreData<CashChargeAnswer> {
  return useCoreQuery({
    queryKey: salesKeys.cashCharge(saleId, pending, tendered),
    read: async () => (tendered === undefined ? "unavailable" : read(tendered)),
    enabled: tendered !== undefined,
  });
}

export function useTakeSale(
  sessionId: string,
  userId: string,
): (sale: OpenSale | null) => Promise<OpenSale | null> {
  const queryClient = useQueryClient();
  return async (sale) => {
    const queryKey = salesKeys.currentSale(sessionId, userId);
    const previous = queryClient.getQueryData<CurrentSaleAnswer>(queryKey);
    await setQueryAnswer(queryClient, queryKey, sale);
    return previous === undefined || previous === "not_permitted" ? null : previous;
  };
}

export function useRefreshCurrentSale(sessionId: string, userId: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: salesKeys.currentSale(sessionId, userId) });
}

export function useResetCurrentSale(sessionId: string, userId: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.resetQueries({ queryKey: salesKeys.currentSale(sessionId, userId) });
}

export function useSearchProducts(
  read: (query: string) => Promise<SearchProductsOutcome>,
): (query: string) => Promise<SearchProductsOutcome> {
  const queryClient = useQueryClient();
  return (query) =>
    queryClient
      .fetchQuery({ queryKey: salesKeys.search(query), queryFn: () => read(query), gcTime: 0 })
      .catch((): SearchProductsOutcome => ({ kind: "unavailable" }));
}
