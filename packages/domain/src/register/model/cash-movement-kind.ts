import type { AuthorizablePermissionKey } from "../../access/index.js";
import { codePointLength } from "../../shared/index.js";

export const CASH_MOVEMENT_KINDS = ["CASH_IN", "CASH_OUT", "WITHDRAWAL"] as const;

export type CashMovementKind = (typeof CASH_MOVEMENT_KINDS)[number];

const PERMISSION_OF_KIND = {
  CASH_IN: "record_cash_in",
  CASH_OUT: "record_cash_expense",
  WITHDRAWAL: "withdraw_cash",
} as const satisfies Record<CashMovementKind, AuthorizablePermissionKey>;

export function cashMovementPermission(kind: CashMovementKind): AuthorizablePermissionKey {
  return PERMISSION_OF_KIND[kind];
}

export const CASH_MOVEMENT_REASON_MAX_LENGTH = 200;

export function cashMovementReason(typed: string): string | undefined {
  const reason = typed.trim();
  if (reason === "" || codePointLength(reason) > CASH_MOVEMENT_REASON_MAX_LENGTH) {
    return undefined;
  }
  return reason;
}
