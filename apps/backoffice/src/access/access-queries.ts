import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchPasskeys, Passkey } from "./passkey-api";
import type { fetchRegistrationOptions } from "./recovery-api";
import type { fetchRole, fetchRoles, RoleDetail, RoleSummary } from "./roles-api";
import { useSendToMyAccount } from "./send-to-my-account";
import type { BranchUser, fetchUser, fetchUserPasskeys, fetchUsers } from "./users-api";

const accessKey = ["access"] as const;

const accessKeys = {
  users: [...accessKey, "users"] as const,
  roles: [...accessKey, "roles"] as const,
  ownPasskeys: [...accessKey, "own-passkeys"] as const,
  role: (id: string) => [...accessKey, "role", id] as const,
  user: (id: string) => [...accessKey, "user", id] as const,
  userPasskeys: (id: string) => [...accessKey, "user-passkeys", id] as const,
  registrationOptions: (token: string) => [...accessKey, "registration-options", token] as const,
};

export type PasskeyList = { passkeys: Passkey[]; loadedAt: Date };

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

// The editor seeds its form, and whether saving asks to confirm for the assigned people, from the
// read made when it opens, so a closed editor leaves no role behind for the next opening.
export function useRoleQuery(params: {
  roleId: string;
  fetchRole: typeof fetchRole;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<RoleRead>({
    queryKey: accessKeys.role(params.roleId),
    read: readRole(params.fetchRole, params.roleId),
    gcTime: 0,
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
    queryKey: accessKeys.user(params.userId),
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
    void client.invalidateQueries({ queryKey: accessKey });
    return fetchCloudQuery(client, {
      queryKey: accessKeys.user(userId),
      read: readUser(params.fetchUser, userId),
    });
  };
}

export function useUserPasskeysQuery(params: {
  userId: string;
  fetchUserPasskeys: typeof fetchUserPasskeys;
  now: () => Date;
  onSessionEnded: () => void;
}) {
  const sendToMyAccount = useSendToMyAccount();
  return useCloudQuery<PasskeyList>({
    queryKey: accessKeys.userPasskeys(params.userId),
    read: async () => {
      const outcome = await params.fetchUserPasskeys(params.userId);
      if (outcome.kind === "ok") {
        return { kind: "ok", value: { passkeys: outcome.value, loadedAt: params.now() } };
      }
      return outcome.kind === "not_found" ? { kind: "failed" } : outcome;
    },
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
  return useCloudQuery<PasskeyList>({
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

export type RegistrationRead =
  | { kind: "ready"; displayName: string; options: PublicKeyCredentialCreationOptionsJSON }
  | { kind: "invalid" | "burned" | "expired" };

function readRegistrationOptions(
  fetchOptions: typeof fetchRegistrationOptions,
  token: string,
): () => Promise<CloudReadOutcome<RegistrationRead>> {
  return async () => {
    const outcome = await fetchOptions(token);
    switch (outcome.kind) {
      case "ok":
        return { kind: "ok", value: { kind: "ready", ...outcome.value } };
      case "invalid":
      case "burned":
      case "expired":
        return { kind: "ok", value: { kind: outcome.kind } };
      case "rate_limited":
        return outcome;
      case "validation_failed":
      case "already_registered":
      case "failed":
        return { kind: "failed" };
    }
  };
}

function ignore() {}

// Each read replaces the challenge the cloud holds for the token, so one read is never shown to a
// later visit.
export function useRegistrationOptionsQuery(params: {
  token: string;
  fetchRegistrationOptions: typeof fetchRegistrationOptions;
}) {
  return useCloudQuery<RegistrationRead>({
    queryKey: accessKeys.registrationOptions(params.token),
    read: readRegistrationOptions(params.fetchRegistrationOptions, params.token),
    gcTime: 0,
    onSessionEnded: ignore,
    onForbidden: ignore,
  });
}

export function useReloadRegistrationOptions(params: {
  fetchRegistrationOptions: typeof fetchRegistrationOptions;
}): (token: string) => Promise<CloudReadOutcome<RegistrationRead>> {
  const client = useQueryClient();
  return (token) =>
    fetchCloudQuery(client, {
      queryKey: accessKeys.registrationOptions(token),
      read: readRegistrationOptions(params.fetchRegistrationOptions, token),
      gcTime: 0,
    });
}
