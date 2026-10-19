import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchAccounts } from "./compromise-response-accounts-api";
import type { CompromiseResponse, fetchCompromiseResponse } from "./compromise-response-api";

export const sessionsKey = ["sessions"] as const;

export const sessionsKeys = {
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
  fetchAccounts: typeof fetchAccounts;
  enabled: boolean;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery({
    queryKey: sessionsKeys.accounts,
    read: params.fetchAccounts,
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
