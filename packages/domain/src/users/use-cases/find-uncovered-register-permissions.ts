import type { PermissionKey } from "../../permissions/index.js";
import { uncoveredRegisterPermissions } from "../../permissions/index.js";
import type { BranchUsers } from "./branch-users.js";

export interface FindUncoveredRegisterPermissionsPorts {
  users: BranchUsers;
}

export interface FindUncoveredRegisterPermissionsInput {
  locationId: string;
}

export async function findUncoveredRegisterPermissions(
  { users }: FindUncoveredRegisterPermissionsPorts,
  input: FindUncoveredRegisterPermissionsInput,
): Promise<PermissionKey[]> {
  return uncoveredRegisterPermissions(await users.activeUserPermissionKeys(input.locationId));
}
