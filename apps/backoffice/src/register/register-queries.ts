import type { ReportRegisterListBody } from "@purosur/contracts";
import type { PermissionKey } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type {
  fetchRegisterCoverage,
  fetchRegisterSyncStatus,
  fetchRegisters,
  RegisterSummary,
  RegisterSyncStatus,
} from "./registers-api";
import type { fetchReportRegisters } from "./report-registers-api";

export const registerKey = ["register"] as const;

export const registerKeys = {
  registers: [...registerKey, "registers"] as const,
  coverage: [...registerKey, "coverage"] as const,
  syncStatus: [...registerKey, "sync-status"] as const,
  reportRegisters: [...registerKey, "report-registers"] as const,
};

export function useRegistersQuery(params: {
  fetchRegisters: typeof fetchRegisters;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RegisterSummary[]>({
    queryKey: registerKeys.registers,
    read: params.fetchRegisters,
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
    queryKey: registerKeys.coverage,
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
    queryKey: registerKeys.syncStatus,
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
    queryKey: registerKeys.reportRegisters,
    read: params.fetchReportRegisters,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshRegisters(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: registerKey });
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
      queryKey: registerKeys.registers,
      read: params.fetchRegisters,
    });
    if (listed.kind !== "ok") {
      return listed;
    }
    const register = listed.value.find((listedRegister) => listedRegister.id === id);
    return register ? { kind: "found", register } : { kind: "not_found" };
  };
}
