import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchPasskeys, Passkey } from "./passkey-api";
import type { fetchRole, fetchRoles, RoleDetail, RoleSummary } from "./roles-api";
import { useSendToMyAccount } from "./send-to-my-account";
import type { BranchUser, fetchUsers } from "./users-api";

const accessKey = ["access"] as const;

const accessKeys = {
  users: [...accessKey, "users"] as const,
  roles: [...accessKey, "roles"] as const,
  ownPasskeys: [...accessKey, "own-passkeys"] as const,
  role: (id: string) => [...accessKey, "role", id] as const,
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

export type RoleRead = { kind: "found"; role: RoleDetail } | { kind: "not_found" };

function readRole(
  fetchRoleById: typeof fetchRole,
  roleId: string,
): () => Promise<CloudReadOutcome<RoleRead>> {
  return async () => {
    const outcome = await fetchRoleById(roleId);
    if (outcome.kind === "ok") {
      return { kind: "ok", value: { kind: "found", role: outcome.value } };
    }
    return outcome.kind === "not_found" ? { kind: "ok", value: { kind: "not_found" } } : outcome;
  };
}

export function useRoleQuery(params: {
  roleId: string;
  fetchRole: typeof fetchRole;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RoleRead>({
    queryKey: accessKeys.role(params.roleId),
    read: readRole(params.fetchRole, params.roleId),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadRole(params: {
  fetchRole: typeof fetchRole;
}): (roleId: string) => Promise<CloudReadOutcome<RoleRead>> {
  const client = useQueryClient();
  return async (roleId) => {
    void client.invalidateQueries({ queryKey: accessKey });
    return fetchCloudQuery(client, {
      queryKey: accessKeys.role(roleId),
      read: readRole(params.fetchRole, roleId),
    });
  };
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
