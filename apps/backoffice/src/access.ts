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
 * Whether "Catálogo" and its pages show at all. Unlike Usuarios and Roles, this is delegable: a
 * non-Administrator whose role holds `manage_products_and_categories` sees it too.
 */
export function canSeeCatalogArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("manage_products_and_categories");
}
