import type { RoleAccess } from "./access-increase.js";
import { holdsPermission } from "./holds-permission.js";
import type { PermissionKey } from "./permission-catalog.js";

const ADMINISTRATOR_ONLY: readonly PermissionKey[] = [];

export const CAPABILITY_PERMISSIONS = {
  manage_users: ADMINISTRATOR_ONLY,
  manage_roles: ADMINISTRATOR_ONLY,
  users_area: ["deactivate_users", "reactivate_users", "reset_user_pin"],
  reset_user_pin: ["reset_user_pin"],
  deactivate_users: ["deactivate_users"],
  reactivate_users: ["reactivate_users"],
  branch_area: ["configure_branch"],
  products_and_categories: ["manage_products_and_categories"],
  prices_area: ["manage_prices_and_review"],
  promotions: ["manage_promotions"],
  catalog_area: ["manage_products_and_categories", "manage_prices_and_review", "manage_promotions"],
  cash_area: ["change_fiscal_configuration"],
  alerts_area: ["view_branch_alerts", "view_all_alerts"],
  close_alerts_manually: ["dismiss_alerts_manually"],
  registers_area: ["enroll_register_devices"],
  stock_balances: ["view_stock_balances"],
  stock_counts: ["perform_stock_counts"],
  stock_losses: ["record_stock_losses"],
  stock_adjustments: ["adjust_stock"],
  stock_movements: ["record_stock_losses", "adjust_stock"],
  stock_area: [
    "view_stock_balances",
    "perform_stock_counts",
    "record_stock_losses",
    "adjust_stock",
  ],
} as const satisfies Record<string, readonly PermissionKey[]>;

export type Capability = keyof typeof CAPABILITY_PERMISSIONS;

export const CAPABILITIES = Object.keys(CAPABILITY_PERMISSIONS) as [Capability, ...Capability[]];

export function grantsCapability(access: RoleAccess, capability: Capability): boolean {
  return (
    access.isAdministrator ||
    CAPABILITY_PERMISSIONS[capability].some((permission: PermissionKey) =>
      holdsPermission(access, permission),
    )
  );
}

export function grantedCapabilities(access: RoleAccess): Capability[] {
  return CAPABILITIES.filter((capability) => grantsCapability(access, capability));
}
