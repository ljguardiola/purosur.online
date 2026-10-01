import type { SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { useCoreQuery } from "../platform/use-core-query";

export const accessKey = ["access"] as const;

const accessKeys = {
  signInUsers: [...accessKey, "sign-in-users"] as const,
  authorizers: (permission: AuthorizablePermissionKey) =>
    [...accessKey, "authorizers", permission] as const,
  lockedClosers: [...accessKey, "locked-closers"] as const,
};

export function useSignInUsersQuery(read: () => Promise<SignInUser[]>): CoreData<SignInUser[]> {
  return useCoreQuery({ queryKey: accessKeys.signInUsers, read });
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
  return useCoreQuery({ queryKey: accessKeys.authorizers(permission), read, enabled });
}

export function useLockedClosersQuery(read: () => Promise<SignInUser[]>): CoreData<SignInUser[]> {
  return useCoreQuery({ queryKey: accessKeys.lockedClosers, read });
}

export function useResetAuthorizers(permission: AuthorizablePermissionKey): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.resetQueries({ queryKey: accessKeys.authorizers(permission) });
}
