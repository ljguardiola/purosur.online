import type { PendingRefundsBody } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchPendingRefunds } from "./refunds-api";

export const paymentsKey = ["payments"] as const;

export const paymentsKeys = {
  pendingRefunds: [...paymentsKey, "pending-refunds"] as const,
};

export function usePendingRefundsQuery(params: {
  onSessionEnded: () => void;
  fetchPendingRefunds: typeof fetchPendingRefunds;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PendingRefundsBody>({
    queryKey: paymentsKeys.pendingRefunds,
    read: params.fetchPendingRefunds,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshPayments(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: paymentsKey });
}
