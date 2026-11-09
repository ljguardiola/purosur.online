import type { CashMovementsBody, CashSessionClosesBody, ReportQuery } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchCashMovements } from "./cash-movements-api";
import type { fetchCashSessionCloses } from "./cash-session-closes-api";
import type { fetchSnapshotBackups, SnapshotBackups } from "./snapshot-backups-api";

export const registerKey = ["register"] as const;

export const registerKeys = {
  cashMovements: (query: ReportQuery) =>
    [
      ...registerKey,
      "cash-movements",
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
    ] as const,
  cashSessionCloses: (query: ReportQuery) =>
    [
      ...registerKey,
      "cash-session-closes",
      query.from ?? "",
      query.to ?? "",
      query.register_id ?? "",
    ] as const,
  snapshotBackups: (registerId: string) =>
    [...registerKey, "snapshot-backups", registerId] as const,
};

export function useCashMovementsQuery(params: {
  query: ReportQuery;
  fetchCashMovements: typeof fetchCashMovements;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<CashMovementsBody>({
    queryKey: registerKeys.cashMovements(params.query),
    keepPreviousData: true,
    read: () => params.fetchCashMovements(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useCashSessionClosesQuery(params: {
  query: ReportQuery;
  fetchCashSessionCloses: typeof fetchCashSessionCloses;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<CashSessionClosesBody>({
    queryKey: registerKeys.cashSessionCloses(params.query),
    keepPreviousData: true,
    read: () => params.fetchCashSessionCloses(params.query),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useSnapshotBackupsQuery(params: {
  registerId: string | undefined;
  fetchSnapshotBackups: typeof fetchSnapshotBackups;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  const { registerId, fetchSnapshotBackups } = params;
  return useCloudQuery<SnapshotBackups>({
    queryKey: registerKeys.snapshotBackups(registerId ?? ""),
    read: () => fetchSnapshotBackups(registerId ?? ""),
    enabled: registerId !== undefined,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshRegister(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: registerKey });
}
