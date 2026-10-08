import type { PermissionKey } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type {
  fetchRegisterCoverage,
  fetchRegisterSyncStatus,
  fetchRegisters,
  RegisterSummary,
  RegisterSyncStatus,
} from "./registers-api";

export const registerKey = ["register"] as const;

export const registerKeys = {
  registers: [...registerKey, "registers"] as const,
  coverage: [...registerKey, "coverage"] as const,
  syncStatus: [...registerKey, "sync-status"] as const,
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

export function useRefreshRegisters(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: registerKey });
}
