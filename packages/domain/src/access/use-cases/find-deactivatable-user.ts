import { isUserDeactivatable } from "../model/user-deactivation.js";
import type { BranchUser, BranchUsers } from "./branch-users.js";
import { findBranchUser } from "./find-branch-user.js";

export interface FindDeactivatableUserPorts {
  users: BranchUsers;
}

export interface FindDeactivatableUserInput {
  locationId: string;
  userId: string;
  actorId: string;
}

export async function findDeactivatableUser(
  { users }: FindDeactivatableUserPorts,
  input: FindDeactivatableUserInput,
): Promise<BranchUser | undefined> {
  const found = await findBranchUser({ users }, input);
  if (
    !found ||
    !isUserDeactivatable(
      { id: found.id, holdsAdministratorRole: found.roleIsAdministrator },
      input.actorId,
    )
  ) {
    return undefined;
  }
  return found;
}
