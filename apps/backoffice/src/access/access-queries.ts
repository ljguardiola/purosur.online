import { useQueryClient } from "@tanstack/react-query";
import { useCloudQuery } from "../platform/use-cloud-query";
import type { fetchPasskeys, Passkey } from "./passkey-api";
import type { fetchRoles, RoleSummary } from "./roles-api";
import { useSendToMyAccount } from "./send-to-my-account";
import type { BranchUser, fetchUsers } from "./users-api";

const accessKey = ["access"] as const;

const accessKeys = {
  users: [...accessKey, "users"] as const,
  roles: [...accessKey, "roles"] as const,
  ownPasskeys: [...accessKey, "own-passkeys"] as const,
};

export type OwnPasskeys = { passkeys: Passkey[]; loadedAt: Date };

export function useUsersQuery(params: {
  fetchUsers: typeof fetchUsers;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<BranchUser[]>({
    queryKey: accessKeys.users,
    read: params.fetchUsers,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRolesQuery(params: {
  fetchRoles: typeof fetchRoles;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RoleSummary[]>({
    queryKey: accessKeys.roles,
    read: params.fetchRoles,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useOwnPasskeysQuery(params: {
  fetchPasskeys: typeof fetchPasskeys;
  now: () => Date;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<OwnPasskeys>({
    queryKey: accessKeys.ownPasskeys,
    read: async () => {
      const outcome = await params.fetchPasskeys();
      return outcome.kind === "ok"
        ? { kind: "ok", value: { passkeys: outcome.value, loadedAt: params.now() } }
        : outcome;
    },
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useRefreshAccess(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: accessKey });
}
