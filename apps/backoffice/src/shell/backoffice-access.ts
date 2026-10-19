import type { Capability, ManualStockMovementKind } from "@purosur/domain";

export type BackofficeAccess = {
  capabilities: readonly Capability[];
  stockMovementKinds: readonly ManualStockMovementKind[];
  mayEmitOwnPinCode: boolean;
};

function grants(access: BackofficeAccess, capability: Capability): boolean {
  return access.capabilities.includes(capability);
}

export function canSeeUsersArea(access: BackofficeAccess): boolean {
  return grants(access, "users_area");
}

export function canManageUsers(access: BackofficeAccess): boolean {
  return grants(access, "manage_users");
}

export function canReactivateUser(access: BackofficeAccess): boolean {
  return grants(access, "reactivate_users");
}

export function canSeeRolesArea(access: BackofficeAccess): boolean {
  return grants(access, "manage_roles");
}

export function canSeeQuarantinedEvents(access: BackofficeAccess): boolean {
  return grants(access, "quarantined_events");
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

export function canAssignPointTerminal(access: BackofficeAccess): boolean {
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

export function canRevokeInstallations(access: BackofficeAccess): boolean {
  return grants(access, "revoke_installations");
}

export function canUseBitlockerRecoveryKey(access: BackofficeAccess): boolean {
  return grants(access, "bitlocker_recovery_key");
}

export function canSeeBackupsArea(access: BackofficeAccess): boolean {
  return grants(access, "backups_area");
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

export function canSeeExpiringLots(access: BackofficeAccess): boolean {
  return grants(access, "stock_expiries");
}

export function canRecordInitialInventory(access: BackofficeAccess): boolean {
  return grants(access, "initial_inventory");
}

export function canManageSuppliers(access: BackofficeAccess): boolean {
  return grants(access, "suppliers");
}

export function canManagePurchasePackagings(access: BackofficeAccess): boolean {
  return grants(access, "purchase_packagings");
}

export function canSeeReports(access: BackofficeAccess): boolean {
  return grants(access, "reports_area");
}

export function canSeeRefundsArea(access: BackofficeAccess): boolean {
  return grants(access, "refunds_area");
}

export function canRecordPurchases(access: BackofficeAccess): boolean {
  return grants(access, "purchases");
}

export function canManageRecipes(access: BackofficeAccess): boolean {
  return grants(access, "recipes");
}

export function canManageBatches(access: BackofficeAccess): boolean {
  return grants(access, "batches");
}

export function canManageFreights(access: BackofficeAccess): boolean {
  return grants(access, "freights");
}
