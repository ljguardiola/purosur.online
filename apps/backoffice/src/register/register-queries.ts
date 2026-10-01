import type { PermissionKey } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchRegisterCoverage, fetchRegisters, RegisterSummary } from "./registers-api";

export const registerKey = ["register"] as const;

export const registerKeys = {
  registers: [...registerKey, "registers"] as const,
  coverage: [...registerKey, "coverage"] as const,
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

export function useRefreshRegisters(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: registerKey });
}
