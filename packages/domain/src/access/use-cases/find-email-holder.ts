import type { BranchUsers, EmailHolder } from "./branch-users.js";

export interface FindEmailHolderPorts {
  users: BranchUsers;
}

export interface FindEmailHolderInput {
  email: string;
}

export function findEmailHolder(
  { users }: FindEmailHolderPorts,
  input: FindEmailHolderInput,
): Promise<EmailHolder | undefined> {
  return users.emailHolder(input.email);
}
