import { isLastActiveAdministrator } from "../model/last-active-administrator.js";
import type { BranchUser, BranchUserActiveScope, BranchUsers } from "./branch-users.js";

export interface FindBranchUserPorts {
  users: BranchUsers;
}

export interface FindBranchUserInput {
  locationId: string;
  userId: string;
  activeScope?: BranchUserActiveScope;
}

export async function findBranchUser(
  { users }: FindBranchUserPorts,
  input: FindBranchUserInput,
): Promise<BranchUser | undefined> {
  const facts = await users.branchUser(
    input.locationId,
    input.userId,
    input.activeScope ?? "active",
  );
  if (!facts) {
    return undefined;
  }
  const activeAdministratorCount = await users.activeAdministratorCount(input.locationId);
  return {
    ...facts,
    isLastActiveAdministrator: isLastActiveAdministrator(
      { holdsAdministratorRole: facts.roleIsAdministrator },
      activeAdministratorCount,
    ),
  };
}
