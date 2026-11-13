import type { ContingencyTicketRecoveriesResponse } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
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
  const sendToOwnAccount = useSendToOwnAccount();
  return useCloudQuery<ContingencyTicketRecoveriesResponse>({
    queryKey: backupsKeys.contingencyTicketRecoveries,
    read: params.fetchContingencyTicketRecoveries,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToOwnAccount,
  });
}

export function useRefreshBackups(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: backupsKey });
}
