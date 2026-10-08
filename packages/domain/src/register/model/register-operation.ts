import {
  type AuthorizablePermissionKey,
  holdsPermission,
  type PermissionKey,
  type RoleAccess,
} from "../../access/index.js";
import { type CashMovementKind, cashMovementPermission } from "./cash-movement-kind.js";
import { isLockedToAnother } from "./register-lock.js";

type OpenSession = { openedBy: string };

export type RegisterOperation =
  | { kind: "open_cash_session" }
  | { kind: "sell" }
  | { kind: "cancel_paid_sale" }
  | { kind: "record_cash_movement"; movement: CashMovementKind }
  | { kind: "close_cash_session"; session: OpenSession }
  | { kind: "close_locked_register"; session: OpenSession | undefined };

export interface RegisterActor {
  id: string;
  access: RoleAccess | undefined;
}

export type RegisterOperationAccess =
  | { kind: "permitted" }
  | { kind: "needs_authorization"; permission: AuthorizablePermissionKey }
  | { kind: "refused" }
  | { kind: "no_access" };

const SELLING_PERMISSION = "sell_and_charge";
const VOID_SALE_PERMISSION = "void_sale";

const PERMITTED = { kind: "permitted" } as const;
const REFUSED = { kind: "refused" } as const;
const NO_ACCESS = { kind: "no_access" } as const;

export function registerOperationAccess(
  operation: RegisterOperation,
  actor: RegisterActor | undefined,
): RegisterOperationAccess {
  if (operation.kind === "close_locked_register") {
    return actor === undefined
      ? { kind: "needs_authorization", permission: "close_anothers_register_session" }
      : REFUSED;
  }
  if (actor === undefined) {
    return REFUSED;
  }
  switch (operation.kind) {
    case "close_cash_session":
      return isLockedToAnother(operation.session, actor.id) ? REFUSED : PERMITTED;
    case "open_cash_session":
    case "sell":
      return actor.access === undefined
        ? NO_ACCESS
        : holdsPermission(actor.access, SELLING_PERMISSION)
          ? PERMITTED
          : REFUSED;
    case "cancel_paid_sale":
      return actor.access === undefined
        ? NO_ACCESS
        : holdsPermission(actor.access, VOID_SALE_PERMISSION)
          ? PERMITTED
          : { kind: "needs_authorization", permission: VOID_SALE_PERMISSION };
    case "record_cash_movement": {
      if (actor.access === undefined) {
        return NO_ACCESS;
      }
      const permission = cashMovementPermission(operation.movement);
      return holdsPermission(actor.access, permission)
        ? PERMITTED
        : { kind: "needs_authorization", permission };
    }
  }
}

export function mayAuthorize(
  operation: RegisterOperation,
  authorizer: { id: string; access: RoleAccess },
): boolean {
  switch (operation.kind) {
    case "cancel_paid_sale":
      return holdsPermission(authorizer.access, VOID_SALE_PERMISSION);
    case "record_cash_movement":
      return holdsPermission(authorizer.access, cashMovementPermission(operation.movement));
    case "close_locked_register":
      return (
        holdsPermission(authorizer.access, "close_anothers_register_session") &&
        isLockedToAnother(operation.session, authorizer.id)
      );
    default:
      return false;
  }
}

export const REGISTER_ABILITIES = [
  "open_cash_session",
  "view_sales_history",
  "reprint_receipt",
  "correct_register_clock",
  "record_initial_inventory",
] as const;

export type RegisterAbility = (typeof REGISTER_ABILITIES)[number];

const PERMISSION_OF_ABILITY = {
  open_cash_session: SELLING_PERMISSION,
  view_sales_history: "view_sales_history",
  reprint_receipt: "reprint_receipt",
  correct_register_clock: "correct_register_clock",
  record_initial_inventory: "record_initial_inventory",
} as const satisfies Record<RegisterAbility, PermissionKey>;

export function registerAbilities(access: RoleAccess): RegisterAbility[] {
  return REGISTER_ABILITIES.filter((ability) =>
    holdsPermission(access, PERMISSION_OF_ABILITY[ability]),
  );
}
