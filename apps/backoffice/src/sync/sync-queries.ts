import type { QuarantinedEventsList } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchQuarantinedEvents } from "./quarantined-events-api";

const syncKey = ["sync"] as const;

const syncKeys = {
  quarantinedEvents: [...syncKey, "quarantined-events"] as const,
};

export function useQuarantinedEventsQuery(params: {
  fetchQuarantinedEvents: typeof fetchQuarantinedEvents;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<QuarantinedEventsList>({
    queryKey: syncKeys.quarantinedEvents,
    read: params.fetchQuarantinedEvents,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshSync(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: syncKey });
}
