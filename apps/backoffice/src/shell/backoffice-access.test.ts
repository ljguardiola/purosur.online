import { expect, test } from "vitest";
import {
  canCloseAlertsManually,
  canDeactivateUser,
  canManageProductsAndCategories,
  canManagePromotions,
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
] as const)("%s holds exactly when the %s capability is granted", (_name, capability, can) => {
  expect(can(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(can(accessWith(capability))).toBe(true);
  expect(can(NO_CAPABILITIES_ACCESS)).toBe(false);
  expect(
    can(accessWith(...ADMINISTRATOR_ACCESS.capabilities.filter((c) => c !== capability))),
  ).toBe(false);
});

test("canSeeRolesArea holds for an Administrator only, whatever capabilities a role is granted", () => {
  expect(canSeeRolesArea(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeRolesArea(accessWith(...ADMINISTRATOR_ACCESS.capabilities))).toBe(false);
});

test("canDeactivateUser needs the deactivate_users capability and a non-Administrator target", () => {
  const target = { isAdministrator: false };

  expect(canDeactivateUser(ADMINISTRATOR_ACCESS, target)).toBe(true);
  expect(canDeactivateUser(accessWith("deactivate_users"), target)).toBe(true);
  expect(canDeactivateUser(NO_CAPABILITIES_ACCESS, target)).toBe(false);
  expect(canDeactivateUser(accessWith("reactivate_users", "users_area"), target)).toBe(false);
});

test("canDeactivateUser is false against an Administrator target, even for an Administrator viewer", () => {
  expect(canDeactivateUser(ADMINISTRATOR_ACCESS, { isAdministrator: true })).toBe(false);
});
