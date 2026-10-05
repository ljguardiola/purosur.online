import type { PermissionCatalogWire } from "@purosur/contracts";
import type { PermissionArea, PermissionKey } from "@purosur/domain";

type Marker = PermissionCatalogWire[number]["permissions"][number]["register_marker"];

const NONE: Marker = "none";
const REGISTER: Marker = "register";
const PIN: Marker = "register_with_another_persons_pin";
const VIEW_BALANCES: PermissionKey[] = ["view_stock_balances"];

const rows: [PermissionArea, PermissionKey, Marker, PermissionKey[]?][] = [
  ["cashRegister", "sell_and_charge", REGISTER],
  ["cashRegister", "view_sales_history", REGISTER],
  ["cashRegister", "close_anothers_register_session", PIN],
  ["cashRegister", "reprint_receipt", PIN],
  ["cashRegister", "record_cash_in", PIN],
  ["cashRegister", "record_cash_expense", PIN],
  ["cashRegister", "withdraw_cash", PIN],
  ["sale", "override_line_price_or_discount", PIN],
  ["sale", "apply_total_discount", PIN],
  ["sale", "void_sale", PIN],
  ["returns", "process_return", PIN],
  ["returns", "authorize_late_defect_refund", PIN],
  ["checkout", "confirm_refunds", PIN],
  ["stock", "record_initial_inventory", REGISTER],
  ["stock", "view_stock_balances", NONE],
  ["stock", "perform_stock_counts", NONE, VIEW_BALANCES],
  ["stock", "adjust_stock", NONE, VIEW_BALANCES],
  ["stock", "record_stock_losses", NONE, VIEW_BALANCES],
  ["purchasing", "manage_suppliers", NONE],
  ["purchasing", "manage_purchase_presentations", NONE],
  ["purchasing", "record_purchases", NONE],
  ["purchasing", "manage_freight", NONE],
  ["purchasing", "manage_expiration_dates", NONE],
  ["purchasing", "manage_supplier_price_lists", NONE],
  ["purchasing", "compare_prices_and_suggest_orders", NONE],
  ["purchasing", "manage_purchase_orders", NONE],
  ["purchasing", "receive_purchase_orders", NONE],
  ["catalog", "manage_products_and_categories", NONE],
  ["catalog", "manage_prices_and_review", NONE],
  ["catalog", "manage_promotions", NONE],
  ["assembledProducts", "manage_recipes", NONE],
  ["assembledProducts", "manage_batches", NONE],
  ["users", "reset_user_pin", NONE],
  ["users", "deactivate_users", NONE],
  ["users", "reactivate_users", NONE],
  ["fiscal", "correct_register_clock", REGISTER],
  ["fiscal", "view_fiscal_documents", NONE],
  ["fiscal", "close_fiscal_tasks", NONE],
  ["fiscal", "change_fiscal_configuration", NONE],
  ["reports", "view_reports", NONE],
  ["alerts", "view_branch_alerts", NONE],
  ["alerts", "view_all_alerts", NONE],
  ["alerts", "dismiss_alerts_manually", NONE],
  ["devices", "enroll_register_devices", NONE],
  ["devices", "revoke_register_devices", NONE],
  ["devices", "view_bitlocker_key", NONE],
  ["backups", "view_backups_and_rotate_key", NONE],
  ["backups", "recover_contingency_receipts", NONE],
  ["branch", "configure_branch", NONE],
];

const areas = [...new Set(rows.map(([area]) => area))];

export const permissionCatalogFixture: PermissionCatalogWire = areas.map((area) => ({
  area,
  permissions: rows
    .filter(([rowArea]) => rowArea === area)
    .map(([, key, register_marker, requires = []]) => ({ key, register_marker, requires })),
}));
