export type CashSessionState = "OPEN" | "CLOSED";

export const CASH_MOVEMENT_TYPES = [
  "OPENING",
  "SALE",
  "CHANGE",
  "REFUND",
  "CASH_IN",
  "CASH_OUT",
  "WITHDRAWAL",
  "CLOSING",
] as const;

export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export interface CashSession {
  id: string;
  registerId: string;
  deviceId: string;
  openedBy: string;
  openedAt: Date;
  openingFloat: number;
  state: CashSessionState;
}

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amount: number;
  actorId: string;
  occurredAt: Date;
  reason?: string;
  ref?: { type: string; id: string };
  authorizedBy?: string;
}
