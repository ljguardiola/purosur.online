import {
  type EditableRoleDetail,
  editableRoleDetail,
  isRoleEditable,
} from "../model/role-editability.js";
import type { RoleDirectory, RoleHolder } from "./role-directory.js";

export interface FindEditableRolePorts {
  roles: RoleDirectory;
}

export interface FindEditableRoleInput {
  roleId: string;
}

export type EditableRole = EditableRoleDetail<RoleHolder>;

export async function findEditableRole(
  { roles }: FindEditableRolePorts,
  input: FindEditableRoleInput,
): Promise<EditableRole | undefined> {
  const role = await roles.role(input.roleId);
  if (!role || !isRoleEditable(role)) {
    return undefined;
  }
  return editableRoleDetail(role, await roles.activeRoleHolders(role.id));
}
