import type { ContingencyTicketRecoveriesResponse } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchContingencyTicketRecoveries } from "./contingency-ticket-recovery-api";

export const backupsKey = ["backups"] as const;

export const backupsKeys = {
  contingencyTicketRecoveries: [...backupsKey, "contingency-ticket-recoveries"] as const,
};

export function useContingencyTicketRecoveriesQuery(params: {
  fetchContingencyTicketRecoveries: typeof fetchContingencyTicketRecoveries;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ContingencyTicketRecoveriesResponse>({
    queryKey: backupsKeys.contingencyTicketRecoveries,
    read: params.fetchContingencyTicketRecoveries,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshBackups(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: backupsKey });
}
