/** What the signed-in session carries for deciding what the backoffice shows: the Administrator flag and the role's permission keys. */
export type BackofficeAccess = {
  isAdministrator: boolean;
  permissions: readonly string[];
};

/**
 * Whether "Usuarios" and its screens show at all. Every Users action is Administrator-only today,
 * so this is just the Administrator flag; a delegable permission there (e.g. `deactivate_users`)
 * will extend this once one ships.
 */
export function canSeeUsersArea(access: BackofficeAccess): boolean {
  return access.isAdministrator;
}

/**
 * Whether "Roles" and its pages show at all. Creating or editing a role, and creating or
 * reassigning a user, are reserved to the Administrator and can never be granted through a
 * permission, so this never depends on `access.permissions`.
 */
export function canSeeRolesArea(access: BackofficeAccess): boolean {
  return access.isAdministrator;
}

/**
 * Whether "Sucursal" and its screen show at all: the Administrator (who holds every permission
 * implicitly) or a role that was delegated `configure_branch`.
 */
export function canSeeBranchArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("configure_branch");
}
