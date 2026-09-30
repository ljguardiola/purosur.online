import { mayEmitPinCodeFor } from "@purosur/domain";

export type BackofficeAccess = {
  isAdministrator: boolean;
  permissions: readonly string[];
};

export function canSeeUsersArea(access: BackofficeAccess): boolean {
  return (
    access.isAdministrator ||
    access.permissions.includes("deactivate_users") ||
    access.permissions.includes("reactivate_users") ||
    access.permissions.includes("reset_user_pin")
  );
}

export function canResetUserPin(
  access: BackofficeAccess,
  signedInUserId: string,
  target: { id: string; isAdministrator: boolean; active?: boolean },
): boolean {
  if (target.active === false) {
    return false;
  }
  if (!access.isAdministrator && !access.permissions.includes("reset_user_pin")) {
    return false;
  }
  // The cloud accepts a user id in any letter case.
  return mayEmitPinCodeFor(
    { id: signedInUserId.toLowerCase(), isAdministrator: access.isAdministrator },
    { id: target.id.toLowerCase(), isAdministrator: target.isAdministrator },
  );
}

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

export function canSeeRolesArea(access: BackofficeAccess): boolean {
  return access.isAdministrator;
}

export function canSeeBranchArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("configure_branch");
}

/** `manage_prices_and_review` alone also unlocks the Catálogo area, without unlocking this section. */
export function canManageProductsAndCategories(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("manage_products_and_categories");
}

export function canSeePricesArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("manage_prices_and_review");
}

export function canManagePromotions(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("manage_promotions");
}

export function canSeeCatalogArea(access: BackofficeAccess): boolean {
  return (
    canManageProductsAndCategories(access) ||
    canSeePricesArea(access) ||
    canManagePromotions(access)
  );
}

export function canSeeCashArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("change_fiscal_configuration");
}

export function canSeeAlertsArea(access: BackofficeAccess): boolean {
  return (
    access.isAdministrator ||
    access.permissions.includes("view_branch_alerts") ||
    access.permissions.includes("view_all_alerts")
  );
}

export function canCloseAlertsManually(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("dismiss_alerts_manually");
}

export function canSeeRegistersArea(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("enroll_register_devices");
}

export function canSeeStockBalances(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("view_stock_balances");
}

export function canPerformStockCounts(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("perform_stock_counts");
}

export function canRecordStockLosses(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("record_stock_losses");
}

export function canAdjustStock(access: BackofficeAccess): boolean {
  return access.isAdministrator || access.permissions.includes("adjust_stock");
}

export function canSeeStockMovements(access: BackofficeAccess): boolean {
  return canRecordStockLosses(access) || canAdjustStock(access);
}

export function canSeeStockArea(access: BackofficeAccess): boolean {
  return (
    canSeeStockBalances(access) || canPerformStockCounts(access) || canSeeStockMovements(access)
  );
}
