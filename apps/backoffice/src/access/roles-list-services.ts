import { fetchPermissionCatalog } from "../platform/permission-catalog-api";
import type { RoleEditorModalServices } from "./role-editor-modal";
import { fetchRoles } from "./roles-api";

export type RolesListScreenServices = {
  fetchRoles: typeof fetchRoles;
  fetchPermissionCatalog: typeof fetchPermissionCatalog;
  roleEditorModal?: RoleEditorModalServices;
};

export const defaultRolesListScreenServices: RolesListScreenServices = {
  fetchRoles,
  fetchPermissionCatalog,
};
