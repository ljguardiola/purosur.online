import type { PinPolicy, SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { coreQueryOptions, useCoreQuery } from "../platform/use-core-query";

export const accessKey = ["access"] as const;

const accessKeys = {
  signInUsers: [...accessKey, "sign-in-users"] as const,
  pinPolicy: [...accessKey, "pin-policy"] as const,
  authorizers: (permission: AuthorizablePermissionKey) =>
    [...accessKey, "authorizers", permission] as const,
};

export function useSignInUsersQuery(read: () => Promise<SignInUser[]>): CoreData<SignInUser[]> {
  return useCoreQuery({ queryKey: accessKeys.signInUsers, read });
}

export function pinPolicyQueryOptions(read: () => Promise<PinPolicy>) {
  return {
    ...coreQueryOptions({ queryKey: accessKeys.pinPolicy, read, staleTime: Infinity }),
    gcTime: Infinity,
  };
}

export function usePinPolicyQuery(read: () => Promise<PinPolicy>): PinPolicy {
  return useSuspenseQuery(pinPolicyQueryOptions(read)).data;
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

export function useResetAuthorizers(permission: AuthorizablePermissionKey): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.resetQueries({ queryKey: accessKeys.authorizers(permission) });
}
