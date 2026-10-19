import { useQueryClient } from "@tanstack/react-query";
import type { fetchUsers } from "../platform/branch-users-api";
import { useSendToMyAccount } from "../platform/send-to-my-account";
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
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<CompromiseResponse | null>({
    queryKey: sessionsKeys.compromiseResponse,
    read: params.fetchCompromiseResponse,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useAccountsQuery(params: {
  fetchUsers: typeof fetchUsers;
  enabled: boolean;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery({
    queryKey: sessionsKeys.accounts,
    read: params.fetchUsers,
    enabled: params.enabled,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadCompromiseResponse(): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: sessionsKey });
  };
}
