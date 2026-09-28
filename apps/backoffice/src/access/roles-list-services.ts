import type { RoleEditorModalServices } from "./role-editor-modal";
import { fetchRoles } from "./roles-api";

export type RolesListScreenServices = {
  fetchRoles: typeof fetchRoles;
  roleEditorModal?: RoleEditorModalServices;
};

export const defaultRolesListScreenServices: RolesListScreenServices = {
  fetchRoles,
};
