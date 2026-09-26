export type BackofficeAccess = {
  isAdministrator: boolean;
  permissions: readonly string[];
};

export function canSeeUsersArea(access: BackofficeAccess): boolean {
  return (
    access.isAdministrator ||
    access.permissions.includes("deactivate_users") ||
    access.permissions.includes("reactivate_users")
  );
}

/** Mirrors the deactivation rule the cloud's own route enforces. */
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
 * Unlike `canDeactivateUser`, this takes no target: the cloud's reactivation route only ever
 * admits an inactive target, and an inactive user can't be the last active Administrator.
 */
export function canReactivateUser(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("reactivate_users");
}

/** Role management can never be granted through a permission — Administrator only. */
export function canSeeRolesArea(access: BackofficeAccess): boolean {
  return access.isAdministrator;
}

export function canSeeBranchArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("configure_branch");
}

/**
 * `manage_prices_and_review` alone unlocks the Catálogo area too (see `canSeeCatalogArea`)
 * without unlocking this section.
 */
export function canManageProductsAndCategories(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("manage_products_and_categories");
}

export function canSeePricesArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("manage_prices_and_review");
}

export function canSeeCatalogArea(access: BackofficeAccess): boolean {
  return canManageProductsAndCategories(access) || canSeePricesArea(access);
}

/** The same permission gates the cloud's own read and edit routes for this area. */
export function canSeeCashArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("change_fiscal_configuration");
}

/** Mirrors the coarse gate the cloud's alert routes enforce before filtering by audience. */
export function canSeeAlertsArea(access: BackofficeAccess): boolean {
  return (
    access.isAdministrator ||
    access.permissions.includes("view_branch_alerts") ||
    access.permissions.includes("view_all_alerts")
  );
}

/** Same permission the cloud's manual-close route gates on. */
export function canCloseAlertsManually(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("dismiss_alerts_manually");
}

/** Same permission that gates the cloud's own register routes. */
export function canSeeRegistersArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("enroll_register_devices");
}
