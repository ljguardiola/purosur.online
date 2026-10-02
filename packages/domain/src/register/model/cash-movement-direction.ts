import type { CashMovementType } from "./cash-session.js";

export const CASH_MOVEMENT_DIRECTIONS = ["in", "out", "none"] as const;

export type CashMovementDirection = (typeof CASH_MOVEMENT_DIRECTIONS)[number];

const DIRECTION = {
  OPENING: "in",
  SALE: "in",
  CASH_IN: "in",
  CHANGE: "out",
  REFUND: "out",
  CASH_OUT: "out",
  WITHDRAWAL: "out",
  CLOSING: "none",
} satisfies Record<CashMovementType, CashMovementDirection>;

export function cashMovementDirection(type: CashMovementType): CashMovementDirection {
  return DIRECTION[type];
}
