export type { RoleAccess } from "./model/access-increase.js";
export { grantedPermissionKeys, increasesAccess } from "./model/access-increase.js";
export type { Capability } from "./model/capability-permissions.js";
export {
  CAPABILITIES,
  CAPABILITY_PERMISSIONS,
  grantedCapabilities,
  grantsCapability,
} from "./model/capability-permissions.js";
export type { AuthorizablePermissionKey } from "./model/holds-permission.js";
export {
  heldPermissionKeys,
  holdsPermission,
  isAuthorizablePermissionKey,
} from "./model/holds-permission.js";
export type {
  PermissionArea,
  PermissionDefinition,
  PermissionKey,
  PermissionRegisterMarker,
} from "./model/permission-catalog.js";
export {
  ALERT_VIEW_PERMISSION_KEYS,
  holdsBothAlertViewPermissions,
  isPermissionKey,
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  repeatsAPermissionKey,
  withOneAlertView,
} from "./model/permission-catalog.js";
export {
  lacksARequiredPermission,
  permissionsRequiring,
  withRequiredPermissions,
} from "./model/permission-requirements.js";
export {
  holdsARegisterPermission,
  uncoveredRegisterPermissions,
} from "./model/register-coverage.js";
export { mayEditRole } from "./model/role-editability.js";
export {
  isAdministratorRoleName,
  isRoleNameTooLong,
  ROLE_NAME_MAX_LENGTH,
  roleNameLength,
} from "./model/role-name.js";
