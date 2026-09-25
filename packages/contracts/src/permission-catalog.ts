// The permission key strings are stored verbatim in the cloud's `role_permissions` table, so a
// role's rows keep meaning across a later rename of the exported constant. Order matches the
// backoffice Roles screen's design source (design.pen `QGFUe`), area by area; the Spanish label
// for each key lives only in each app's own message catalog, never here.
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

export type PermissionArea =
  | "cashRegister"
  | "sale"
  | "returns"
  | "checkout"
  | "stock"
  | "purchasing"
  | "catalog"
  | "assembledProducts"
  | "users"
  | "fiscal"
  | "reports"
  | "alerts"
  | "devices"
  | "backups"
  | "branch";

/** Every permission area, in the role editor's areas pane order — the same order the catalog
 * below groups its permissions in. */
export const PERMISSION_AREAS: readonly PermissionArea[] = [
  "cashRegister",
  "sale",
  "returns",
  "checkout",
  "stock",
  "purchasing",
  "catalog",
  "assembledProducts",
  "users",
  "fiscal",
  "reports",
  "alerts",
  "devices",
  "backups",
  "branch",
];

/**
 * Whether using this permission at the register requires nothing beyond being signed in there
 * (`"register"`), requires another person's register PIN (`"register_with_another_persons_pin"`),
 * or never applies at the register at all (`"none"`).
 */
export type PermissionRegisterMarker = "none" | "register" | "register_with_another_persons_pin";

export interface PermissionDefinition {
  key: PermissionKey;
  area: PermissionArea;
  registerMarker: PermissionRegisterMarker;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: "sell_and_charge", area: "cashRegister", registerMarker: "register" },
  { key: "view_sales_history", area: "cashRegister", registerMarker: "register" },
  {
    key: "close_anothers_register_session",
    area: "cashRegister",
    registerMarker: "register_with_another_persons_pin",
  },
  {
    key: "reprint_receipt",
    area: "cashRegister",
    registerMarker: "register_with_another_persons_pin",
  },
  {
    key: "record_cash_in",
    area: "cashRegister",
    registerMarker: "register_with_another_persons_pin",
  },
  {
    key: "record_cash_expense",
    area: "cashRegister",
    registerMarker: "register_with_another_persons_pin",
  },
  {
    key: "withdraw_cash",
    area: "cashRegister",
    registerMarker: "register_with_another_persons_pin",
  },

  {
    key: "override_line_price_or_discount",
    area: "sale",
    registerMarker: "register_with_another_persons_pin",
  },
  {
    key: "apply_total_discount",
    area: "sale",
    registerMarker: "register_with_another_persons_pin",
  },
  { key: "void_sale", area: "sale", registerMarker: "register_with_another_persons_pin" },

  {
    key: "process_return",
    area: "returns",
    registerMarker: "register_with_another_persons_pin",
  },
  {
    key: "authorize_late_defect_refund",
    area: "returns",
    registerMarker: "register_with_another_persons_pin",
  },

  {
    key: "confirm_refunds",
    area: "checkout",
    registerMarker: "register_with_another_persons_pin",
  },

  { key: "record_initial_inventory", area: "stock", registerMarker: "register" },
  { key: "view_stock_balances", area: "stock", registerMarker: "none" },
  { key: "perform_stock_counts", area: "stock", registerMarker: "none" },
  { key: "adjust_stock", area: "stock", registerMarker: "none" },
  { key: "record_stock_losses", area: "stock", registerMarker: "none" },

  { key: "manage_suppliers", area: "purchasing", registerMarker: "none" },
  { key: "manage_purchase_presentations", area: "purchasing", registerMarker: "none" },
  { key: "record_purchases", area: "purchasing", registerMarker: "none" },
  { key: "manage_freight", area: "purchasing", registerMarker: "none" },
  { key: "manage_expiration_dates", area: "purchasing", registerMarker: "none" },
  { key: "manage_supplier_price_lists", area: "purchasing", registerMarker: "none" },
  { key: "compare_prices_and_suggest_orders", area: "purchasing", registerMarker: "none" },
  { key: "manage_purchase_orders", area: "purchasing", registerMarker: "none" },
  { key: "receive_purchase_orders", area: "purchasing", registerMarker: "none" },

  { key: "manage_products_and_categories", area: "catalog", registerMarker: "none" },
  { key: "manage_prices_and_review", area: "catalog", registerMarker: "none" },
  { key: "manage_promotions", area: "catalog", registerMarker: "none" },

  { key: "manage_recipes", area: "assembledProducts", registerMarker: "none" },
  { key: "manage_batches", area: "assembledProducts", registerMarker: "none" },

  { key: "reset_user_pin", area: "users", registerMarker: "none" },
  { key: "deactivate_users", area: "users", registerMarker: "none" },

  { key: "correct_register_clock", area: "fiscal", registerMarker: "register" },
  { key: "view_fiscal_documents", area: "fiscal", registerMarker: "none" },
  { key: "close_fiscal_tasks", area: "fiscal", registerMarker: "none" },
  { key: "change_fiscal_configuration", area: "fiscal", registerMarker: "none" },

  { key: "view_reports", area: "reports", registerMarker: "none" },

  { key: "view_branch_alerts", area: "alerts", registerMarker: "none" },
  { key: "view_all_alerts", area: "alerts", registerMarker: "none" },
  { key: "dismiss_alerts_manually", area: "alerts", registerMarker: "none" },

  { key: "enroll_register_devices", area: "devices", registerMarker: "none" },
  { key: "revoke_register_devices", area: "devices", registerMarker: "none" },
  { key: "view_bitlocker_key", area: "devices", registerMarker: "none" },

  { key: "view_backups_and_rotate_key", area: "backups", registerMarker: "none" },
  { key: "recover_contingency_receipts", area: "backups", registerMarker: "none" },

  { key: "configure_branch", area: "branch", registerMarker: "none" },
] as const;

/**
 * A role may hold at most one of these: the Alertas area draws them as a single radio ("No ve
 * alertas / Ver alertas del local / Ver todas las alertas"), never as two independent checkboxes.
 */
export const ALERT_VIEW_PERMISSION_KEYS: readonly [PermissionKey, PermissionKey] = [
  "view_branch_alerts",
  "view_all_alerts",
];

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(PERMISSION_KEY_LIST);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === "string" && PERMISSION_KEY_SET.has(value);
}
