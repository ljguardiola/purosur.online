import type { CurrentSaleAnswer, OpenSale, SearchProductsOutcome } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { setQueryAnswer } from "../platform/set-query-answer";
import type { CoreData } from "../platform/use-core-query";
import { useCoreQuery } from "../platform/use-core-query";

const salesKey = ["sales"] as const;

export const salesKeys = {
  currentSale: [...salesKey, "current-sale"] as const,
  search: (query: string) => [...salesKey, "search", query] as const,
};

export function useCurrentSaleQuery(
  read: () => Promise<CurrentSaleAnswer>,
): CoreData<CurrentSaleAnswer> {
  return useCoreQuery({ queryKey: salesKeys.currentSale, read });
}

export function useTakeSale(): (sale: OpenSale) => Promise<OpenSale | null> {
  const queryClient = useQueryClient();
  return async (sale) => {
    const previous = queryClient.getQueryData<CurrentSaleAnswer>(salesKeys.currentSale);
    await setQueryAnswer(queryClient, salesKeys.currentSale, sale);
    return previous === undefined || previous === "not_permitted" ? null : previous;
  };
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
