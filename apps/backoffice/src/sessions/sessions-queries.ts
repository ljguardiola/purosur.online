import { useQueryClient } from "@tanstack/react-query";
import type { fetchUsers } from "../platform/branch-users-api";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { CompromiseResponse, fetchCompromiseResponse } from "./compromise-response-api";

const sessionsKey = ["sessions"] as const;

const sessionsKeys = {
  compromiseResponse: [...sessionsKey, "compromise-response"] as const,
  accounts: [...sessionsKey, "compromise-response-accounts"] as const,
};

export function useCompromiseResponseQuery(params: {
  fetchCompromiseResponse: typeof fetchCompromiseResponse;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<CompromiseResponse | null>({
    queryKey: sessionsKeys.compromiseResponse,
    read: params.fetchCompromiseResponse,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useAccountsQuery(params: {
  fetchUsers: typeof fetchUsers;
  enabled: boolean;
  onSessionEnded: () => void;
}) {
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery({
    queryKey: sessionsKeys.accounts,
    read: params.fetchUsers,
    enabled: params.enabled,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useReloadCompromiseResponse(): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: sessionsKey });
  };
}
