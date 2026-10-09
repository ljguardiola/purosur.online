import type { SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { useCoreQuery } from "../platform/use-core-query";

export const sessionsKey = ["sessions"] as const;

const sessionsKeys = {
  signInUsers: [...sessionsKey, "sign-in-users"] as const,
  authorizers: [...sessionsKey, "authorizers"] as const,
};

function authorizersOf(permission: AuthorizablePermissionKey) {
  return [...sessionsKeys.authorizers, permission] as const;
}

export function useSignInUsersQuery(read: () => Promise<SignInUser[]>): CoreData<SignInUser[]> {
  return useCoreQuery({ queryKey: sessionsKeys.signInUsers, read });
}

export function useAuthorizersQuery({
  permission,
  read,
  enabled,
}: {
  permission: AuthorizablePermissionKey;
  read: () => Promise<SignInUser[]>;
  enabled: boolean;
}): CoreData<SignInUser[]> {
  return useCoreQuery({ queryKey: authorizersOf(permission), read, enabled });
}

export function useResetAuthorizers(permission: AuthorizablePermissionKey): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.resetQueries({ queryKey: authorizersOf(permission) });
}
