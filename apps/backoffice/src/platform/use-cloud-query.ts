import { type QueryClient, type QueryKey, useQuery } from "@tanstack/react-query";
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
  gcTime?: number;
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
  { queryKey, read, gcTime }: CloudQuery<T>,
): Promise<CloudReadOutcome<T>> {
  try {
    return {
      kind: "ok",
      value: await queryClient.fetchQuery({
        queryKey,
        queryFn: cloudQueryFn(read),
        ...(gcTime === undefined ? {} : { gcTime }),
      }),
    };
  } catch (error) {
    return error instanceof CloudReadRefused ? error.refusal : { kind: "failed" };
  }
}

export function useCloudQuery<T>({
  queryKey,
  read,
  gcTime,
  onSessionEnded,
  onForbidden,
}: CloudQuery<T> & {
  onSessionEnded: () => void;
  onForbidden: () => void;
}): CloudData<T> {
  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const onForbiddenRef = useLatestRef(onForbidden);
  const query = useQuery({
    queryKey,
    queryFn: cloudQueryFn(read),
    ...(gcTime === undefined ? {} : { gcTime }),
  });
  const refusal = query.error instanceof CloudReadRefused ? query.error.refusal : undefined;
  const refusalReadWhileShown = query.isFetchedAfterMount ? refusal : undefined;

  useEffect(() => {
    if (refusalReadWhileShown?.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (refusalReadWhileShown?.kind === "forbidden") {
      onForbiddenRef.current();
    }
  }, [refusalReadWhileShown, onSessionEndedRef, onForbiddenRef]);

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
