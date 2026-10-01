import type { QueryKey } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

export type CoreData<T> =
  | { status: "loading" }
  | { status: "loaded"; value: T; refreshing: boolean }
  | { status: "failed"; retry: () => void };

type CoreQuery<T> = {
  queryKey: QueryKey;
  read: () => Promise<T | "unavailable">;
};

function coreQueryFn<T>(read: () => Promise<T | "unavailable">): () => Promise<T> {
  return async () => {
    const answer = await read();
    if (answer === "unavailable") {
      throw new Error("the core could not answer");
    }
    return answer;
  };
}

export function useCoreQuery<T>({ queryKey, read }: CoreQuery<T>): CoreData<T> {
  const query = useQuery({ queryKey, queryFn: coreQueryFn(read) });
  if (query.isError && !query.isFetching) {
    return { status: "failed", retry: () => void query.refetch() };
  }
  if (query.isSuccess) {
    return { status: "loaded", value: query.data, refreshing: query.isFetching };
  }
  return { status: "loading" };
}
