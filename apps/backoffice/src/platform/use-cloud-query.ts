import { type QueryClient, type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { CloudReadOutcome } from "./cloud-read-outcome";
import { useLatestRef } from "./use-latest-ref";

export type CloudData<T> =
  | { status: "loading" }
  | { status: "loaded"; value: T; refreshing: boolean }
  | { status: "failed"; retryAfterSeconds?: number; retry: () => void };

type RefusedRead = Exclude<CloudReadOutcome<unknown>, { kind: "ok" }>;

class CloudReadRefused extends Error {
  readonly refusal: RefusedRead;

  constructor(refusal: RefusedRead) {
    super(refusal.kind);
    this.refusal = refusal;
  }
}

type CloudQuery<T> = {
  queryKey: QueryKey;
  read: () => Promise<CloudReadOutcome<T>>;
};

function cloudQueryFn<T>(read: () => Promise<CloudReadOutcome<T>>): () => Promise<T> {
  return async () => {
    const outcome = await read();
    if (outcome.kind !== "ok") {
      throw new CloudReadRefused(outcome);
    }
    return outcome.value;
  };
}

export async function fetchCloudQuery<T>(
  queryClient: QueryClient,
  { queryKey, read }: CloudQuery<T>,
): Promise<CloudReadOutcome<T>> {
  try {
    return {
      kind: "ok",
      value: await queryClient.fetchQuery({ queryKey, queryFn: cloudQueryFn(read) }),
    };
  } catch (error) {
    return error instanceof CloudReadRefused ? error.refusal : { kind: "failed" };
  }
}

export function useCloudQuery<T>({
  queryKey,
  read,
  onSessionEnded,
  onForbidden,
}: CloudQuery<T> & {
  onSessionEnded: () => void;
  onForbidden: () => void;
}): CloudData<T> {
  const queryClient = useQueryClient();
  const queryKeyRef = useLatestRef(queryKey);
  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const onForbiddenRef = useLatestRef(onForbidden);
  const query = useQuery({ queryKey, queryFn: cloudQueryFn(read) });
  const refusal = query.error instanceof CloudReadRefused ? query.error.refusal : undefined;

  useEffect(() => {
    if (refusal?.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (refusal?.kind === "forbidden") {
      queryClient.removeQueries({ queryKey: queryKeyRef.current, exact: true });
      onForbiddenRef.current();
    }
  }, [refusal, queryClient, queryKeyRef, onSessionEndedRef, onForbiddenRef]);

  const leavingScreen = refusal?.kind === "unauthenticated" || refusal?.kind === "forbidden";
  if (query.isError && !query.isFetching && !leavingScreen) {
    return {
      status: "failed",
      ...(refusal?.kind === "rate_limited" ? { retryAfterSeconds: refusal.retryAfterSeconds } : {}),
      retry: () => void query.refetch(),
    };
  }
  if (query.isSuccess) {
    return { status: "loaded", value: query.data, refreshing: query.isFetching };
  }
  return { status: "loading" };
}
