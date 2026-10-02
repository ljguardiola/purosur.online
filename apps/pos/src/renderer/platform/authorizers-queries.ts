import type { SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { useQueryClient } from "@tanstack/react-query";
import type { CoreData } from "./use-core-query";
import { useCoreQuery } from "./use-core-query";

export const authorizersKey = ["authorizers"] as const;

function authorizersOf(permission: AuthorizablePermissionKey) {
  return [...authorizersKey, permission] as const;
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
