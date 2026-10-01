import type { AccountProfile, Accounts } from "./accounts.js";

export interface FindAccountProfilePorts {
  accounts: Accounts;
}

export interface FindAccountProfileInput {
  userId: string;
}

export function findAccountProfile(
  { accounts }: FindAccountProfilePorts,
  input: FindAccountProfileInput,
): Promise<AccountProfile | undefined> {
  return accounts.profile(input.userId);
}
