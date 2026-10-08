import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useQueryClient } from "@tanstack/react-query";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import type { fetchRoles, RoleSummary } from "../platform/roles-api";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { fetchCloudQuery, useCloudQuery } from "../platform/use-cloud-query";
import type { fetchPasskeys, Passkey } from "./passkey-api";
import type { fetchRegistrationOptions } from "./recovery-api";
import type { BranchUser, fetchUser, fetchUserPasskeys, fetchUsers } from "./users-api";

const accessKey = ["access"] as const;

const accessKeys = {
  users: [...accessKey, "users"] as const,
  roles: [...accessKey, "roles"] as const,
  ownPasskeys: [...accessKey, "own-passkeys"] as const,
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

export function useRefreshAccess(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: accessKey });
}
