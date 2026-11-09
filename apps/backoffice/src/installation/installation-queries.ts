import type { ReportRegisterListBody } from "@purosur/contracts";
import type { PermissionKey } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type {
  FetchRegisterNamesOutcome,
  fetchRegisterCoverage,
  fetchRegisterSyncStatus,
  fetchRegisters,
  RegisterName,
  RegisterSummary,
  RegisterSyncStatus,
} from "./registers-api";
import type { fetchReportRegisters } from "./report-registers-api";

export type RegisterNamesSource = "fiscal" | "backups";

export const installationKey = ["installation"] as const;

export const installationKeys = {
  registers: [...installationKey, "registers"] as const,
  registerNames: (source: RegisterNamesSource) =>
    [...installationKey, "register-names", source] as const,
  coverage: [...installationKey, "coverage"] as const,
  syncStatus: [...installationKey, "sync-status"] as const,
  reportRegisters: [...installationKey, "report-registers"] as const,
};

export function useRegistersQuery(params: {
  fetchRegisters: typeof fetchRegisters;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RegisterSummary[]>({
    queryKey: installationKeys.registers,
    read: params.fetchRegisters,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRegisterNamesQuery(params: {
  source: RegisterNamesSource;
  fetchRegisterNames: () => Promise<FetchRegisterNamesOutcome>;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RegisterName[]>({
    queryKey: installationKeys.registerNames(params.source),
    read: params.fetchRegisterNames,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRegisterCoverageQuery(params: {
  fetchRegisterCoverage: typeof fetchRegisterCoverage;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PermissionKey[]>({
    queryKey: installationKeys.coverage,
    read: params.fetchRegisterCoverage,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRegisterSyncStatusQuery(params: {
  fetchRegisterSyncStatus: typeof fetchRegisterSyncStatus;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RegisterSyncStatus[]>({
    queryKey: installationKeys.syncStatus,
    read: params.fetchRegisterSyncStatus,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReportRegistersQuery(params: {
  fetchReportRegisters: typeof fetchReportRegisters;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<ReportRegisterListBody>({
    queryKey: installationKeys.reportRegisters,
    read: params.fetchReportRegisters,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export type RegisterReload =
  | { kind: "found"; register: RegisterSummary }
  | { kind: "not_found" }
  | Exclude<CloudReadOutcome<never>, { kind: "ok" }>;

export function useReloadRegister(params: {
  fetchRegisters: typeof fetchRegisters;
}): (id: string) => Promise<RegisterReload> {
  const client = useQueryClient();
  return async (id) => {
    const listed = await fetchCloudQuery(client, {
      queryKey: installationKeys.registers,
      read: params.fetchRegisters,
    });
    if (listed.kind !== "ok") {
      return listed;
    }
    const register = listed.value.find((listedRegister) => listedRegister.id === id);
    return register ? { kind: "found", register } : { kind: "not_found" };
  };
}

export function useRefreshInstallation(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: installationKey });
}
