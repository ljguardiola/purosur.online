import { expect, test } from "vitest";
import {
  canAdjustStock,
  canCloseAlertsManually,
  canDeactivateUser,
  canManageProductsAndCategories,
  canManagePromotions,
  canPerformStockCounts,
  canReactivateUser,
  canRecordStockLosses,
  canResetUserPin,
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
  ["canRecordStockLosses", "stock_losses", canRecordStockLosses],
  ["canAdjustStock", "stock_adjustments", canAdjustStock],
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

const holder = accessWith("reset_user_pin");
const cashier = { id: "user-2", isAdministrator: false };

test("canResetUserPin is true for a holder of the reset_user_pin capability against another non-Administrator", () => {
  expect(canResetUserPin(holder, "user-1", cashier)).toBe(true);
});

test("canResetUserPin is false without the reset_user_pin capability", () => {
  expect(canResetUserPin(accessWith("users_area"), "user-1", cashier)).toBe(false);
});

test("canResetUserPin is false for a holder against an Administrator", () => {
  expect(canResetUserPin(holder, "user-1", { id: "user-2", isAdministrator: true })).toBe(false);
});

test("canResetUserPin is false for a holder against themselves, whatever the id's letter case", () => {
  expect(canResetUserPin(holder, "USER-1", { id: "user-1", isAdministrator: false })).toBe(false);
});

test("canResetUserPin is true for an Administrator against another Administrator and against themselves", () => {
  expect(
    canResetUserPin(ADMINISTRATOR_ACCESS, "user-1", { id: "user-2", isAdministrator: true }),
  ).toBe(true);
  expect(
    canResetUserPin(ADMINISTRATOR_ACCESS, "user-1", { id: "user-1", isAdministrator: true }),
  ).toBe(true);
});

test("canResetUserPin is false against an inactive user", () => {
  expect(canResetUserPin(holder, "user-1", { ...cashier, active: false })).toBe(false);
});
