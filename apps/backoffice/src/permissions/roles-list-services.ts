import { fetchPermissionCatalog } from "../platform/permission-catalog-api";
import { fetchRoles } from "../platform/roles-api";
import type { RoleEditorModalServices } from "./role-editor-modal";

export type RolesListScreenServices = {
  fetchRoles: typeof fetchRoles;
  fetchPermissionCatalog: typeof fetchPermissionCatalog;
  roleEditorModal?: RoleEditorModalServices;
};

export const defaultRolesListScreenServices: RolesListScreenServices = {
  fetchRoles,
  fetchPermissionCatalog,
};
