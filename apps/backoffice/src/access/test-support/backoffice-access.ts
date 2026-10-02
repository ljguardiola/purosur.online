import type { Capability } from "@purosur/domain";
import type { BackofficeAccess } from "../backoffice-access";

const EVERY_CAPABILITY: Record<Capability, true> = {
  users_area: true,
  reset_user_pin: true,
  deactivate_users: true,
  reactivate_users: true,
  branch_area: true,
  products_and_categories: true,
  prices_area: true,
  promotions: true,
  catalog_area: true,
  cash_area: true,
  alerts_area: true,
  close_alerts_manually: true,
  registers_area: true,
  stock_balances: true,
  stock_counts: true,
  stock_losses: true,
  stock_adjustments: true,
  stock_movements: true,
  stock_area: true,
};

export const ADMINISTRATOR_CAPABILITIES = Object.keys(EVERY_CAPABILITY) as Capability[];

export const ADMINISTRATOR_ACCESS: BackofficeAccess = {
  isAdministrator: true,
  capabilities: ADMINISTRATOR_CAPABILITIES,
  stockMovementKinds: ["loss", "adjustment"],
};

export const NO_CAPABILITIES_ACCESS: BackofficeAccess = {
  isAdministrator: false,
  capabilities: [],
  stockMovementKinds: [],
};

export function accessWith(...capabilities: Capability[]): BackofficeAccess {
  return {
    isAdministrator: false,
    capabilities,
    stockMovementKinds: [],
  };
}
