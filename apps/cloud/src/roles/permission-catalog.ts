// Mirrors `@purosur/contracts`'s catalog; `permission-catalog.test.ts` guards against drift.
const PERMISSION_KEY_LIST = [
  "sell_and_charge",
  "view_sales_history",
  "close_anothers_register_session",
  "reprint_receipt",
  "record_cash_in",
  "record_cash_expense",
  "withdraw_cash",
  "override_line_price_or_discount",
  "apply_total_discount",
  "void_sale",
  "process_return",
  "authorize_late_defect_refund",
  "confirm_refunds",
  "record_initial_inventory",
  "view_stock_balances",
  "perform_stock_counts",
  "adjust_stock",
  "record_stock_losses",
  "manage_suppliers",
  "manage_purchase_presentations",
  "record_purchases",
  "manage_freight",
  "manage_expiration_dates",
  "manage_supplier_price_lists",
  "compare_prices_and_suggest_orders",
  "manage_purchase_orders",
  "receive_purchase_orders",
  "manage_products_and_categories",
  "manage_prices_and_review",
  "manage_promotions",
  "manage_recipes",
  "manage_batches",
  "reset_user_pin",
  "deactivate_users",
  "reactivate_users",
  "correct_register_clock",
  "view_fiscal_documents",
  "close_fiscal_tasks",
  "change_fiscal_configuration",
  "view_reports",
  "view_branch_alerts",
  "view_all_alerts",
  "dismiss_alerts_manually",
  "enroll_register_devices",
  "revoke_register_devices",
  "view_bitlocker_key",
  "view_backups_and_rotate_key",
  "recover_contingency_receipts",
  "configure_branch",
] as const;

export type PermissionKey = (typeof PERMISSION_KEY_LIST)[number];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_KEY_LIST;

/** A role may hold at most one of these; see `@purosur/contracts`'s own catalog for why. */
export const ALERT_VIEW_PERMISSION_KEYS: readonly [PermissionKey, PermissionKey] = [
  "view_branch_alerts",
  "view_all_alerts",
];

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(PERMISSION_KEY_LIST);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === "string" && PERMISSION_KEY_SET.has(value);
}
