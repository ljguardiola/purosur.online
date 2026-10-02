import { type Capability, type ManualStockMovementKind, mayEmitPinCodeFor } from "@purosur/domain";

export type BackofficeAccess = {
  isAdministrator: boolean;
  capabilities: readonly Capability[];
  stockMovementKinds: readonly ManualStockMovementKind[];
};

function grants(access: BackofficeAccess, capability: Capability): boolean {
  return access.capabilities.includes(capability);
}

export function canSeeUsersArea(access: BackofficeAccess): boolean {
  return grants(access, "users_area");
}

export function canResetUserPin(
  access: BackofficeAccess,
  signedInUserId: string,
  target: { id: string; isAdministrator: boolean; active?: boolean },
): boolean {
  if (target.active === false) {
    return false;
  }
  if (!grants(access, "reset_user_pin")) {
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
  return grants(access, "deactivate_users");
}

/**
 * Unlike `canDeactivateUser`, this takes no target: the cloud's reactivation route only ever
 * admits an inactive target, and an inactive user can't be the last active Administrator.
 */
export function canReactivateUser(access: BackofficeAccess): boolean {
  return grants(access, "reactivate_users");
}

export function canSeeRolesArea(access: BackofficeAccess): boolean {
  return access.isAdministrator;
}

export function canSeeBranchArea(access: BackofficeAccess): boolean {
  return grants(access, "branch_area");
}

/** `manage_prices_and_review` alone also unlocks the Catálogo area, without unlocking this section. */
export function canManageProductsAndCategories(access: BackofficeAccess): boolean {
  return grants(access, "products_and_categories");
}

export function canSeePricesArea(access: BackofficeAccess): boolean {
  return grants(access, "prices_area");
}

export function canManagePromotions(access: BackofficeAccess): boolean {
  return grants(access, "promotions");
}

export function canSeeCatalogArea(access: BackofficeAccess): boolean {
  return grants(access, "catalog_area");
}

export function canSeeCashArea(access: BackofficeAccess): boolean {
  return grants(access, "cash_area");
}

export function canSeeAlertsArea(access: BackofficeAccess): boolean {
  return grants(access, "alerts_area");
}

export function canCloseAlertsManually(access: BackofficeAccess): boolean {
  return grants(access, "close_alerts_manually");
}

export function canSeeRegistersArea(access: BackofficeAccess): boolean {
  return grants(access, "registers_area");
}

export function canSeeStockBalances(access: BackofficeAccess): boolean {
  return grants(access, "stock_balances");
}

export function canPerformStockCounts(access: BackofficeAccess): boolean {
  return grants(access, "stock_counts");
}

export function canSeeStockMovements(access: BackofficeAccess): boolean {
  return grants(access, "stock_movements");
}

export function canSeeStockArea(access: BackofficeAccess): boolean {
  return grants(access, "stock_area");
}
