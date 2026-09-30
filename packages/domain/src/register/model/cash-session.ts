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

interface CashSessionOpening {
  id: string;
  registerId: string;
  deviceId: string;
  openedBy: string;
  openedAt: Date;
  openingFloat: number;
}

export interface OpenedCashSession extends CashSessionOpening {
  state: "OPEN";
}

export interface ClosedCashSession extends CashSessionOpening {
  state: "CLOSED";
  closedBy: string;
  closedAt: Date;
  expectedCash: number;
  countedCash: number;
  difference: number;
}

export type CashSession = OpenedCashSession | ClosedCashSession;

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
