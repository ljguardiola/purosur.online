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
  canSeeContingencyTicketRescue,
  canSeeExpiringLots,
  canSeeFiscalConfigurationArea,
  canSeeFiscalInformation,
  canSeeFiscalPage,
  canSeeLossesByReason,
  canSeeMercadoPagoChargeCosts,
  canSeePeopleArea,
  canSeePricesArea,
  canSeeProductsPage,
  canSeePurchaseOrdersPage,
  canSeePurchasesPage,
  canSeePurchasingArea,
  canSeeQuarantinedEvents,
  canSeeRefundsArea,
  canSeeRefundsPage,
  canSeeRegistersArea,
  canSeeRegistersList,
  canSeeRegistersPage,
  canSeeReports,
  canSeeReportsPage,
  canSeeReturnsReport,
  canSeeRolesArea,
  canSeeStockArea,
  canSeeStockBalances,
  canSeeStockMovements,
  canSeeStockPage,
  canSeeSuppliersPage,
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
  ["canSeeProductsPage", "catalog_area", canSeeProductsPage],
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
  ["canSeeLossesByReason", "stock_losses", canSeeLossesByReason],
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
  ["canSeeReports", "reports_area", canSeeReports],
  ["canSeeReturnsReport", "returns_report", canSeeReturnsReport],
  ["canSeeMercadoPagoChargeCosts", "mercado_pago_charge_costs", canSeeMercadoPagoChargeCosts],
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

test.each([
  "stock_balances",
  "stock_expiries",
  "stock_counts",
  "stock_movements",
  "initial_inventory",
] as const)("canSeeStockPage holds with only the %s capability", (capability) => {
  expect(canSeeStockPage(accessWith(capability))).toBe(true);
});

test("canSeeStockPage does not hold with the stock area alone, nor with no capability", () => {
  expect(canSeeStockPage(accessWith("stock_area"))).toBe(false);
  expect(canSeeStockPage(NO_CAPABILITIES_ACCESS)).toBe(false);
  expect(canSeeStockPage(ADMINISTRATOR_ACCESS)).toBe(true);
});

test("canSeeAiCostReport holds only when both the reports area and the branch area are granted", () => {
  expect(canSeeAiCostReport(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeAiCostReport(accessWith("reports_area", "branch_area"))).toBe(true);
  expect(canSeeAiCostReport(accessWith("reports_area"))).toBe(false);
  expect(canSeeAiCostReport(accessWith("branch_area"))).toBe(false);
  expect(canSeeAiCostReport(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test("canSeeReportsPage holds with the reports area or with the Mercado Pago charge costs", () => {
  expect(canSeeReportsPage(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeReportsPage(accessWith("reports_area"))).toBe(true);
  expect(canSeeReportsPage(accessWith("mercado_pago_charge_costs"))).toBe(true);
  expect(canSeeReportsPage(accessWith("returns_report", "branch_area"))).toBe(false);
  expect(canSeeReportsPage(NO_CAPABILITIES_ACCESS)).toBe(false);
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

test("canSeeFiscalPage holds with fiscal information, fiscal configuration or the contingency ticket rescue", () => {
  expect(canSeeFiscalPage(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeFiscalPage(accessWith("fiscal_information"))).toBe(true);
  expect(canSeeFiscalPage(accessWith("fiscal_configuration_area"))).toBe(true);
  expect(canSeeFiscalPage(accessWith("contingency_ticket_rescue"))).toBe(true);
  expect(canSeeFiscalPage(accessWith("reports_area"))).toBe(false);
  expect(canSeeFiscalPage(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test("canSeeRegistersList holds with the registers area, fiscal configuration or backups area", () => {
  expect(canSeeRegistersList(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeRegistersList(accessWith("registers_area"))).toBe(true);
  expect(canSeeRegistersList(accessWith("fiscal_configuration_area"))).toBe(true);
  expect(canSeeRegistersList(accessWith("backups_area"))).toBe(true);
  expect(canSeeRegistersList(accessWith("reports_area"))).toBe(false);
  expect(canSeeRegistersList(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test.each(["suppliers", "supplier_price_lists"] as const)(
  "canSeeSuppliersPage holds with only the %s capability",
  (capability) => {
    expect(canSeeSuppliersPage(accessWith(capability))).toBe(true);
  },
);

test("canSeeSuppliersPage holds for an Administrator and not with other purchasing capabilities", () => {
  expect(canSeeSuppliersPage(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeeSuppliersPage(accessWith("purchases", "freights", "price_comparison"))).toBe(false);
  expect(canSeeSuppliersPage(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test("canSeePurchasingArea holds exactly when the purchasing area capability is granted", () => {
  expect(canSeePurchasingArea(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeePurchasingArea(accessWith("purchasing_area"))).toBe(true);
  expect(canSeePurchasingArea(accessWith("stock_area", "suppliers", "freights"))).toBe(false);
  expect(canSeePurchasingArea(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test.each(["purchase_order_reads", "price_comparison"] as const)(
  "canSeePurchaseOrdersPage holds with only the %s capability",
  (capability) => {
    expect(canSeePurchaseOrdersPage(accessWith(capability))).toBe(true);
  },
);

test("canSeePurchaseOrdersPage holds for an Administrator and not with other purchasing capabilities", () => {
  expect(canSeePurchaseOrdersPage(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeePurchaseOrdersPage(accessWith("purchase_orders", "purchases", "freights"))).toBe(
    false,
  );
  expect(canSeePurchaseOrdersPage(NO_CAPABILITIES_ACCESS)).toBe(false);
});

test.each(["purchases", "freights"] as const)(
  "canSeePurchasesPage holds with only the %s capability",
  (capability) => {
    expect(canSeePurchasesPage(accessWith(capability))).toBe(true);
  },
);

test("canSeePurchasesPage holds for an Administrator and not with other purchasing capabilities", () => {
  expect(canSeePurchasesPage(ADMINISTRATOR_ACCESS)).toBe(true);
  expect(canSeePurchasesPage(accessWith("purchase_orders", "suppliers", "purchase_choices"))).toBe(
    false,
  );
  expect(canSeePurchasesPage(NO_CAPABILITIES_ACCESS)).toBe(false);
});
