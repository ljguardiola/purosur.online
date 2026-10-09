import type { QueryKey } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";

export type CoreData<T> =
  | { status: "loading" }
  | { status: "loaded"; value: T; refreshing: boolean }
  | { status: "failed"; retry: () => void };

type CoreQuery<T> = {
  queryKey: QueryKey;
  read: () => Promise<T | "unavailable">;
  enabled?: boolean;
  staleTime?: number | undefined;
  refetchInterval?: ((value: T | undefined) => number | false) | undefined;
};

export function coreQueryOptions<T>({ queryKey, read, staleTime }: CoreQuery<T>) {
  return queryOptions({
    queryKey,
    ...(staleTime === undefined ? {} : { staleTime }),
    queryFn: async (): Promise<T> => {
      const answer = await read();
      if (answer === "unavailable") {
        throw new Error("the core could not answer");
      }
      return answer;
    },
  });
}

export function useCoreQuery<T>({
  queryKey,
  read,
  enabled = true,
  staleTime,
  refetchInterval,
}: CoreQuery<T>): CoreData<T> {
  const query = useQuery({
    ...coreQueryOptions({ queryKey, read, staleTime }),
    enabled,
    ...(refetchInterval === undefined
      ? {}
      : { refetchInterval: (current) => refetchInterval(current.state.data) }),
  });
  if (query.data !== undefined) {
    return { status: "loaded", value: query.data, refreshing: query.isFetching };
  }
  if (query.isError && !query.isFetching) {
    return { status: "failed", retry: () => void query.refetch() };
  }
  return { status: "loading" };
}
