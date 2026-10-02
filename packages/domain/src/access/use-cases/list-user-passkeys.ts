import type { BranchUserActiveScope, BranchUsers } from "./branch-users.js";
import { findBranchUser } from "./find-branch-user.js";
import type { PasskeySummary, Passkeys } from "./passkeys.js";

export interface ListUserPasskeysPorts {
  users: BranchUsers;
  passkeys: Passkeys;
}

export interface ListUserPasskeysInput {
  locationId: string;
  userId: string;
  activeScope: BranchUserActiveScope;
}

export type ListUserPasskeysOutcome =
  | { kind: "not_found" }
  | { kind: "listed"; passkeys: PasskeySummary[] };

export async function listUserPasskeys(
  { users, passkeys }: ListUserPasskeysPorts,
  input: ListUserPasskeysInput,
): Promise<ListUserPasskeysOutcome> {
  const user = await findBranchUser({ users }, input);
  if (!user) {
    return { kind: "not_found" };
  }
  return { kind: "listed", passkeys: await passkeys.passkeySummaries(user.id) };
}
