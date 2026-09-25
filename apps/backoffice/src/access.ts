/** What the signed-in session carries for deciding what the backoffice shows: the Administrator flag and the role's permission keys. */
export type BackofficeAccess = {
  isAdministrator: boolean;
  permissions: readonly string[];
};

/**
 * Whether "Usuarios" and its screens show at all: the Administrator, or a role delegated
 * `deactivate_users` — the only Users action a non-Administrator can perform today. Every other
 * action inside those screens (creating a user, editing an email, removing a passkey) stays
 * Administrator-only and is gated on its own inside the screen that offers it.
 */
export function canSeeUsersArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("deactivate_users");
}

/**
 * Whether the signed-in session can deactivate the given user: the Administrator (who holds every
 * permission implicitly) or a role delegated `deactivate_users`, and never against an
 * Administrator target — the same rule the cloud's own route enforces.
 */
export function canDeactivateUser(
  access: BackofficeAccess,
  target: { isAdministrator: boolean },
): boolean {
  if (target.isAdministrator) {
    return false;
  }
  return access.isAdministrator || access.permissions.includes("deactivate_users");
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

/**
 * Whether "Catálogo" and its pages show at all. Unlike Usuarios and Roles, this is delegable: a
 * non-Administrator whose role holds `manage_products_and_categories` sees it too.
 */
export function canSeeCatalogArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("manage_products_and_categories");
}

/**
 * Whether "Caja" and its "Caja y fiscal" section show at all: the Administrator or a role that was
 * delegated `change_fiscal_configuration`. The same permission also gates the cloud's own read and
 * edit routes, so a `forbidden` answer can only ever mean the permission changed mid-session.
 */
export function canSeeCashArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("change_fiscal_configuration");
}
