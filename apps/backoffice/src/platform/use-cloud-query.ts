import {
  keepPreviousData,
  type QueryClient,
  type QueryKey,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import type { CloudReadOutcome } from "./cloud-read-outcome";

export type CloudData<T> =
  | { status: "loading"; lastValue?: T }
  | { status: "loaded"; value: T; refreshing: boolean }
  | { status: "failed"; retryAfterSeconds?: number; retry: () => void; lastValue?: T };

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
  keepPreviousData: keepsPreviousData = false,
  read,
  gcTime,
  refetchInterval,
  onSessionEnded,
  onForbidden,
}: CloudQuery<T> & {
  keepPreviousData?: boolean | undefined;
  refetchInterval?: number;
  onSessionEnded: () => void;
  onForbidden: () => void;
}): CloudData<T> {
  const endSession = useEffectEvent(onSessionEnded);
  const handleForbidden = useEffectEvent(onForbidden);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: cloudQueryFn(read),
    ...(gcTime === undefined ? {} : { gcTime }),
    ...(keepsPreviousData ? { placeholderData: keepPreviousData } : {}),
  });
  const refreshInBackground = useEffectEvent(async () => {
    const before = queryClient.getQueryState(queryKey);
    if (before?.fetchStatus === "fetching") {
      return;
    }
    const outcome = await read().catch((): CloudReadOutcome<T> => ({ kind: "failed" }));
    if (outcome.kind === "ok") {
      if (queryClient.getQueryState(queryKey) === before) {
        queryClient.setQueryData(queryKey, outcome.value);
      }
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else if (outcome.kind === "forbidden") {
      handleForbidden();
    }
  });

  useEffect(() => {
    if (refetchInterval === undefined) {
      return;
    }
    const timer = setInterval(() => void refreshInBackground(), refetchInterval);
    return () => clearInterval(timer);
  }, [refetchInterval]);

  const [lastLoaded, setLastLoaded] = useState<{ value: T } | undefined>(undefined);
  if (keepsPreviousData && query.isSuccess && query.data !== lastLoaded?.value) {
    setLastLoaded({ value: query.data });
  }
  const kept = lastLoaded === undefined ? {} : { lastValue: lastLoaded.value };
  const refusal = query.error instanceof CloudReadRefused ? query.error.refusal : undefined;
  const refusalReadWhileShown = query.isFetchedAfterMount ? refusal : undefined;

  useEffect(() => {
    if (refusalReadWhileShown?.kind === "unauthenticated") {
      endSession();
    } else if (refusalReadWhileShown?.kind === "forbidden") {
      handleForbidden();
    }
  }, [refusalReadWhileShown]);

  const leavingScreen = refusal?.kind === "unauthenticated" || refusal?.kind === "forbidden";
  if (query.isError && !query.isFetching && !leavingScreen) {
    return {
      status: "failed",
      ...(refusal?.kind === "rate_limited" ? { retryAfterSeconds: refusal.retryAfterSeconds } : {}),
      retry: () => void query.refetch(),
      ...kept,
    };
  }
  const rereadingFailure = query.isPlaceholderData && query.errorUpdateCount > 0;
  if (query.isSuccess && !rereadingFailure) {
    return { status: "loaded", value: query.data, refreshing: query.isFetching };
  }
  return { status: "loading", ...kept };
}
