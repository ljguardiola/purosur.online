import { isLastActiveAdministrator } from "../model/last-active-administrator.js";
import type { BranchUser, BranchUserActiveScope, BranchUsers } from "./branch-users.js";

export interface ListBranchUsersPorts {
  users: BranchUsers;
}

export interface ListBranchUsersInput {
  locationId: string;
  activeScope?: BranchUserActiveScope;
}

export async function listBranchUsers(
  { users }: ListBranchUsersPorts,
  input: ListBranchUsersInput,
): Promise<BranchUser[]> {
  const facts = await users.branchUsers(input.locationId, input.activeScope ?? "active");
  const activeAdministratorCount = await users.activeAdministratorCount(input.locationId);
  return facts.map((user) => ({
    ...user,
    isLastActiveAdministrator: isLastActiveAdministrator(
      { holdsAdministratorRole: user.roleIsAdministrator },
      activeAdministratorCount,
    ),
  }));
}
