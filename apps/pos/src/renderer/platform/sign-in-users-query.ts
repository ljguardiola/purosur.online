import type { SignInUsers } from "./core-client";
import type { CoreData } from "./use-core-query";
import { useCoreQuery } from "./use-core-query";

export const signInUsersKey = ["sessions", "sign-in-users"] as const;

export function useSignInUsersQuery(read: () => Promise<SignInUsers>): CoreData<SignInUsers> {
  return useCoreQuery({ queryKey: signInUsersKey, read });
}
