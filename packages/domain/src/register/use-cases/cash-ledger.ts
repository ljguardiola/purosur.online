import type { RoleAccess } from "../../permissions/index.js";
import type { IdGenerator, OutboxEventDraft, RegisterIdentity } from "../../shared/index.js";
import type { CashMovement, ClosedCashSession, OpenedCashSession } from "../model/cash-session.js";

export type { IdGenerator, RegisterIdentity };

export interface CashLedger {
  transaction<TOutcome>(work: (tx: CashLedgerTransaction) => TOutcome): TOutcome;
}

export interface CashLedgerTransaction {
  openerAccess(userId: string): RoleAccess | undefined;
  openSession(): OpenedCashSession | undefined;
  openSaleTotal(sessionId: string): number | undefined;
  sessionMovements(sessionId: string): CashMovement[];
  registerIdentity(): RegisterIdentity | undefined;
  recordOpenedSession(session: OpenedCashSession): void;
  recordClosedSession(session: ClosedCashSession): void;
  recordCashMovement(movement: CashMovement): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}
