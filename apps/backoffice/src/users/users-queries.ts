import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import type { fetchRoles, RoleSummary } from "../platform/roles-api";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { BranchUser, fetchUser, fetchUsers } from "./users-api";

const usersKey = ["users"] as const;

const usersKeys = {
  list: [...usersKey, "list"] as const,
  roles: [...usersKey, "roles"] as const,
  user: (id: string) => [...usersKey, "user", id] as const,
};

export function useUsersQuery(params: {
  fetchUsers: typeof fetchUsers;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<BranchUser[]>({
    queryKey: usersKeys.list,
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
    queryKey: usersKeys.roles,
    read: params.fetchRoles,
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export type UserRead = { kind: "found"; user: BranchUser } | { kind: "not_found" };

function readUser(
  fetchUserById: typeof fetchUser,
  userId: string,
): () => Promise<CloudReadOutcome<UserRead>> {
  return async () => {
    const outcome = await fetchUserById(userId);
    if (outcome.kind === "ok") {
      return { kind: "ok", value: { kind: "found", user: outcome.value } };
    }
    return outcome.kind === "not_found" ? { kind: "ok", value: { kind: "not_found" } } : outcome;
  };
}

export function useUserQuery(params: {
  userId: string;
  fetchUser: typeof fetchUser;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<UserRead>({
    queryKey: usersKeys.user(params.userId),
    read: readUser(params.fetchUser, params.userId),
    onSessionEnded: params.onSessionEnded,
    onForbidden: sendToMyAccount,
  });
}

export function useReloadUser(params: {
  fetchUser: typeof fetchUser;
}): (userId: string) => Promise<CloudReadOutcome<UserRead>> {
  const client = useQueryClient();
  return async (userId) => {
    void client.invalidateQueries({ queryKey: usersKey });
    return fetchCloudQuery(client, {
      queryKey: usersKeys.user(userId),
      read: readUser(params.fetchUser, userId),
    });
  };
}

export function useRefreshUsers(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: usersKey });
}
