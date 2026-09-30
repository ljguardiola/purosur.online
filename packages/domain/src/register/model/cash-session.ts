export type CashSessionState = "OPEN" | "CLOSED";

export type CashMovementType =
  | "OPENING"
  | "SALE"
  | "CHANGE"
  | "REFUND"
  | "CASH_IN"
  | "CASH_OUT"
  | "WITHDRAWAL"
  | "CLOSING";

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
  ref?: string;
  authorizedBy?: string;
}
