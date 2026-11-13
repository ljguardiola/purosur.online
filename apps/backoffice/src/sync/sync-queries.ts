import type { QuarantinedEventsList } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchQuarantinedEvents } from "./quarantined-events-api";

export const syncKey = ["sync"] as const;

export const syncKeys = {
  quarantinedEvents: [...syncKey, "quarantined-events"] as const,
};

export function useQuarantinedEventsQuery(params: {
  fetchQuarantinedEvents: typeof fetchQuarantinedEvents;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<QuarantinedEventsList>({
    queryKey: syncKeys.quarantinedEvents,
    read: params.fetchQuarantinedEvents,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useRefreshSync(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: syncKey });
}
