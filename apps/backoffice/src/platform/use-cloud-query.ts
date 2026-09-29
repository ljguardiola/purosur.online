import { type QueryKey, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
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

export function useCloudQuery<T>({
  queryKey,
  read,
  onSessionEnded,
}: {
  queryKey: QueryKey;
  read: () => Promise<CloudReadOutcome<T>>;
  onSessionEnded: () => void;
}): CloudData<T> {
  const sendToMyAccount = useSendToMyAccount();
  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const sendToMyAccountRef = useLatestRef(sendToMyAccount);
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const outcome = await read();
      if (outcome.kind !== "ok") {
        throw new CloudReadRefused(outcome);
      }
      return outcome.value;
    },
  });
  const refusal = query.error instanceof CloudReadRefused ? query.error.refusal : undefined;

  useEffect(() => {
    if (refusal?.kind === "unauthenticated") {
      onSessionEndedRef.current();
    } else if (refusal?.kind === "forbidden") {
      sendToMyAccountRef.current();
    }
  }, [refusal, onSessionEndedRef, sendToMyAccountRef]);

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
