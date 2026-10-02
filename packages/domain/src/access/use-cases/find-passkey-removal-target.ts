import type { BranchUser, BranchUsers } from "./branch-users.js";
import { findBranchUser } from "./find-branch-user.js";

export interface FindPasskeyRemovalTargetPorts {
  users: BranchUsers;
}

export interface FindPasskeyRemovalTargetInput {
  locationId: string;
  administratorId: string;
  targetUserId: string;
}

export type FindPasskeyRemovalTargetOutcome =
  | { kind: "user_not_found" }
  | { kind: "own_account" }
  | { kind: "found"; target: BranchUser };

export async function findPasskeyRemovalTarget(
  { users }: FindPasskeyRemovalTargetPorts,
  input: FindPasskeyRemovalTargetInput,
): Promise<FindPasskeyRemovalTargetOutcome> {
  const target = await findBranchUser(
    { users },
    { locationId: input.locationId, userId: input.targetUserId },
  );
  if (!target) {
    return { kind: "user_not_found" };
  }
  if (target.id === input.administratorId) {
    return { kind: "own_account" };
  }
  return { kind: "found", target };
}
