import type {
  InitialCountLine,
  ReadInitialCountOutcome,
  SearchCountableProductsOutcome,
} from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { coreQueryOptions, useCoreQuery } from "../platform/use-core-query";

const stockKey = ["stock"] as const;

export const stockKeys = {
  initialCount: [...stockKey, "initial-count"] as const,
  countableSearch: (query: string) => [...stockKey, "countable-search", query] as const,
};

export type ShownInitialCount = Exclude<ReadInitialCountOutcome, { kind: "unavailable" }>;

function shownCount(read: () => Promise<ReadInitialCountOutcome>) {
  return async (): Promise<ShownInitialCount | "unavailable"> => {
    const outcome = await read();
    return outcome.kind === "unavailable" ? "unavailable" : outcome;
  };
}

export function initialCountQueryOptions(read: () => Promise<ReadInitialCountOutcome>) {
  return coreQueryOptions({ queryKey: stockKeys.initialCount, read: shownCount(read) });
}

export function useInitialCountQuery(
  read: () => Promise<ReadInitialCountOutcome>,
): CoreData<ShownInitialCount> {
  return useCoreQuery({ queryKey: stockKeys.initialCount, read: shownCount(read) });
}

export function linesOf(count: CoreData<ShownInitialCount>): CoreData<InitialCountLine[]> {
  if (count.status !== "loaded") {
    return count;
  }
  return {
    status: "loaded",
    refreshing: count.refreshing,
    value: count.value.kind === "read" ? count.value.lines : [],
  };
}

export function useRefreshInitialCount(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: stockKeys.initialCount });
}

export function useSearchCountableProducts(
  read: (query: string) => Promise<SearchCountableProductsOutcome>,
): (query: string) => Promise<SearchCountableProductsOutcome> {
  const queryClient = useQueryClient();
  return (query) =>
    queryClient
      .fetchQuery({
        queryKey: stockKeys.countableSearch(query),
        queryFn: () => read(query),
        gcTime: 0,
      })
      .catch((): SearchCountableProductsOutcome => ({ kind: "unavailable" }));
}
