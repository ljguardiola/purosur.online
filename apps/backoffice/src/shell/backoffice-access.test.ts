import { expect, test } from "vitest";
import {
  canCloseAlertsManually,
  canManageProductsAndCategories,
  canManagePromotions,
  canManageUsers,
  canPerformStockCounts,
  canReactivateUser,
  canSeeAlertsArea,
  canSeeBranchArea,
  canSeeCashArea,
  canSeeCatalogArea,
  canSeePricesArea,
  canSeeRegistersArea,
  canSeeRolesArea,
  canSeeStockArea,
  canSeeStockBalances,
  canSeeStockMovements,
  canSeeUsersArea,
} from "./backoffice-access";
import {
  ADMINISTRATOR_ACCESS,
  accessWith,
  NO_CAPABILITIES_ACCESS,
} from "./test-support/backoffice-access";

test.each([
  ["canSeeUsersArea", "users_area", canSeeUsersArea],
  ["canSeeBranchArea", "branch_area", canSeeBranchArea],
  ["canManageProductsAndCategories", "products_and_categories", canManageProductsAndCategories],
  ["canSeePricesArea", "prices_area", canSeePricesArea],
  ["canManagePromotions", "promotions", canManagePromotions],
  ["canSeeCatalogArea", "catalog_area", canSeeCatalogArea],
  ["canSeeCashArea", "cash_area", canSeeCashArea],
  ["canSeeAlertsArea", "alerts_area", canSeeAlertsArea],
  ["canCloseAlertsManually", "close_alerts_manually", canCloseAlertsManually],
  ["canSeeRegistersArea", "registers_area", canSeeRegistersArea],
  ["canSeeStockBalances", "stock_balances", canSeeStockBalances],
  ["canPerformStockCounts", "stock_counts", canPerformStockCounts],
  ["canSeeStockMovements", "stock_movements", canSeeStockMovements],
  ["canSeeStockArea", "stock_area", canSeeStockArea],
  ["canReactivateUser", "reactivate_users", canReactivateUser],
  ["canManageUsers", "manage_users", canManageUsers],
  ["canSeeRolesArea", "manage_roles", canSeeRolesArea],
] as const)("%s holds exactly when the %s capability is granted", (_name, capability, can) => {
  expect(can(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(can(accessWith(capability))).toBe(true);
  expect(can(NO_CAPABILITIES_ACCESS)).toBe(false);
  expect(
    can(accessWith(...ADMINISTRATOR_ACCESS.capabilities.filter((c) => c !== capability))),
  ).toBe(false);
});
