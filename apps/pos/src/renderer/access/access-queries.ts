import type { PinPolicy, SignInUser } from "@purosur/contracts";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { coreQueryOptions, useCoreQuery } from "../platform/use-core-query";

export const accessKey = ["access"] as const;

const accessKeys = {
  signInUsers: [...accessKey, "sign-in-users"] as const,
  pinPolicy: [...accessKey, "pin-policy"] as const,
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
