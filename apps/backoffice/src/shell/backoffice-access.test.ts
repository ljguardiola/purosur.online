import { expect, test } from "vitest";
import {
  canAssignPointTerminal,
  canAssignQrPointOfSale,
  canCloseAlertsManually,
  canCloseFiscalTasks,
  canComparePrices,
  canEnrollRegisters,
  canManageBatches,
  canManageFreights,
  canManageProductsAndCategories,
  canManagePromotions,
  canManagePurchaseOrders,
  canManageRecipes,
  canManageSupplierPriceLists,
  canManageSuppliers,
  canManageUsers,
  canPerformStockCounts,
  canReactivateUser,
  canReadPurchaseOrders,
  canReceivePurchaseOrders,
  canRecordInitialInventory,
  canRecordPurchases,
  canRevokeInstallations,
  canSeeAiCostReport,
  canSeeAlertsArea,
  canSeeBackupsArea,
  canSeeBranchArea,
  canSeeCatalogArea,
  canSeeContingencyTicketRescue,
  canSeeExpiringLots,
  canSeeFiscalConfigurationArea,
  canSeeFiscalInformation,
  canSeeOrdersArea,
  canSeePeopleArea,
  canSeePricesArea,
  canSeeQuarantinedEvents,
  canSeeRefundsArea,
  canSeeRefundsPage,
  canSeeRegistersArea,
  canSeeRegistersPage,
  canSeeReports,
  canSeeReturnsReport,
  canSeeRolesArea,
  canSeeStockArea,
  canSeeStockBalances,
  canSeeStockMovements,
  canSeeUsersArea,
  canUseBitlockerRecoveryKey,
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
  ["canSeeFiscalConfigurationArea", "fiscal_configuration_area", canSeeFiscalConfigurationArea],
  ["canAssignPointTerminal", "fiscal_configuration_area", canAssignPointTerminal],
  ["canAssignQrPointOfSale", "fiscal_configuration_area", canAssignQrPointOfSale],
  ["canSeeAlertsArea", "alerts_area", canSeeAlertsArea],
  ["canCloseAlertsManually", "close_alerts_manually", canCloseAlertsManually],
  ["canCloseFiscalTasks", "close_fiscal_tasks", canCloseFiscalTasks],
  ["canSeeRegistersArea", "registers_area", canSeeRegistersArea],
  ["canEnrollRegisters", "enroll_registers", canEnrollRegisters],
  ["canRevokeInstallations", "revoke_installations", canRevokeInstallations],
  ["canUseBitlockerRecoveryKey", "bitlocker_recovery_key", canUseBitlockerRecoveryKey],
  ["canSeeBackupsArea", "backups_area", canSeeBackupsArea],
  ["canSeeStockBalances", "stock_balances", canSeeStockBalances],
  ["canPerformStockCounts", "stock_counts", canPerformStockCounts],
  ["canSeeStockMovements", "stock_movements", canSeeStockMovements],
  ["canSeeStockArea", "stock_area", canSeeStockArea],
  ["canSeeExpiringLots", "stock_expiries", canSeeExpiringLots],
  ["canRecordInitialInventory", "initial_inventory", canRecordInitialInventory],
  ["canManageSuppliers", "suppliers", canManageSuppliers],
  ["canRecordPurchases", "purchases", canRecordPurchases],
  ["canManageRecipes", "recipes", canManageRecipes],
  ["canManageBatches", "batches", canManageBatches],
  ["canManageFreights", "freights", canManageFreights],
  ["canManageSupplierPriceLists", "supplier_price_lists", canManageSupplierPriceLists],
  ["canComparePrices", "price_comparison", canComparePrices],
  ["canManagePurchaseOrders", "purchase_orders", canManagePurchaseOrders],
  ["canReadPurchaseOrders", "purchase_order_reads", canReadPurchaseOrders],
  ["canReceivePurchaseOrders", "purchase_order_receipts", canReceivePurchaseOrders],
  ["canSeeOrdersArea", "orders_area", canSeeOrdersArea],
  ["canSeeReports", "reports_area", canSeeReports],
  ["canSeeReturnsReport", "returns_report", canSeeReturnsReport],
  ["canSeeRefundsArea", "refunds_area", canSeeRefundsArea],
  ["canReactivateUser", "reactivate_users", canReactivateUser],
  ["canManageUsers", "manage_users", canManageUsers],
  ["canSeeRolesArea", "manage_roles", canSeeRolesArea],
  ["canSeeQuarantinedEvents", "quarantined_events", canSeeQuarantinedEvents],
  ["canSeeContingencyTicketRescue", "contingency_ticket_rescue", canSeeContingencyTicketRescue],
  ["canSeeFiscalInformation", "fiscal_information", canSeeFiscalInformation],
] as const)("%s holds exactly when the %s capability is granted", (_name, capability, can) => {
  expect(can(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(can(accessWith(capability))).toBe(true);
  expect(can(NO_CAPABILITIES_ACCESS)).toBe(false);
  expect(
    can(accessWith(...ADMINISTRATOR_ACCESS.capabilities.filter((c) => c !== capability))),
  ).toBe(false);
});

test("canSeeAiCostReport holds only when both the reports area and the branch area are granted", () => {
  expect(canSeeAiCostReport(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeAiCostReport(accessWith("reports_area", "branch_area"))).toBe(true);
  expect(canSeeAiCostReport(accessWith("reports_area"))).toBe(false);
  expect(canSeeAiCostReport(accessWith("branch_area"))).toBe(false);
  expect(canSeeAiCostReport(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test("canSeePeopleArea holds when either the users area or the roles are granted", () => {
  expect(canSeePeopleArea(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeePeopleArea(accessWith("users_area"))).toBe(true);
  expect(canSeePeopleArea(accessWith("manage_roles"))).toBe(true);
  expect(canSeePeopleArea(accessWith("manage_users"))).toBe(false);
  expect(canSeePeopleArea(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test("canSeeRefundsPage holds when either the refunds area or the returns report is granted", () => {
  expect(canSeeRefundsPage(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeRefundsPage(accessWith("refunds_area"))).toBe(true);
  expect(canSeeRefundsPage(accessWith("returns_report"))).toBe(true);
  expect(canSeeRefundsPage(accessWith("reports_area"))).toBe(false);
  expect(canSeeRefundsPage(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test("canSeeRegistersPage holds with the registers, reports, fiscal configuration or backups area", () => {
  expect(canSeeRegistersPage(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeRegistersPage(accessWith("registers_area"))).toBe(true);
  expect(canSeeRegistersPage(accessWith("reports_area"))).toBe(true);
  expect(canSeeRegistersPage(accessWith("fiscal_configuration_area"))).toBe(true);
  expect(canSeeRegistersPage(accessWith("backups_area"))).toBe(true);
  expect(canSeeRegistersPage(accessWith("refunds_area"))).toBe(false);
  expect(canSeeRegistersPage(NO_CAPABILITIES_ACCESS)).toBe(false);
});
