import type { CashMovementKind } from "./cash-movement-kind.js";

export interface CashSessionOpenedFact {
  id: string;
  openedBy: string;
  openedAt: Date;
  openingFloat: number;
}

export interface CashSessionClosedFact {
  id: string;
  closedBy: string;
  closedAt: Date;
  expectedCash: number;
  countedCash: number;
  difference: number;
}

export interface CashMovementRecordedFact {
  sessionId: string;
  type: CashMovementKind;
  amount: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  actorId: string;
  authorizedBy: string | null;
  occurredAt: Date;
}
