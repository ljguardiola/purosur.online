import type { PinPolicy } from "@purosur/contracts";
import { useSuspenseQuery } from "@tanstack/react-query";
import { coreQueryOptions } from "../platform/use-core-query";

export const credentialsKey = ["credentials"] as const;

const credentialsKeys = {
  pinPolicy: [...credentialsKey, "pin-policy"] as const,
};

export function pinPolicyQueryOptions(read: () => Promise<PinPolicy>) {
  return {
    ...coreQueryOptions({ queryKey: credentialsKeys.pinPolicy, read, staleTime: Infinity }),
    gcTime: Infinity,
  };
}

export function usePinPolicyQuery(read: () => Promise<PinPolicy>): PinPolicy {
  return useSuspenseQuery(pinPolicyQueryOptions(read)).data;
}
