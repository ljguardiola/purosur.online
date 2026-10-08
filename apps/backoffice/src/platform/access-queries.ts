import { useQueryClient } from "@tanstack/react-query";
import type { fetchRoles, RoleSummary } from "./roles-api";
import { useSendToMyAccount } from "./send-to-my-account";
import { useCloudQuery } from "./use-cloud-query";

export const accessKey = ["access"] as const;

const rolesKey = [...accessKey, "roles"] as const;

export function useRolesQuery(params: {
  fetchRoles: typeof fetchRoles;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RoleSummary[]>({
    queryKey: rolesKey,
    read: params.fetchRoles,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshAccess(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: accessKey });
}
