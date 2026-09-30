import type { RoleAccess } from "../../access/index.js";
import type { OutboxEventDraft } from "../../sync/index.js";
import type { CashMovement, ClosedCashSession, OpenedCashSession } from "../model/cash-session.js";

export interface RegisterIdentity {
  registerId: string;
  deviceId: string;
}

export interface IdGenerator {
  next(): string;
}

export interface CashLedger {
  transaction<TOutcome>(work: (tx: CashLedgerTransaction) => TOutcome): TOutcome;
}

export interface CashLedgerTransaction {
  openerAccess(userId: string): RoleAccess | undefined;
  openSession(): OpenedCashSession | undefined;
  openSaleTotal(): number | undefined;
  sessionMovements(sessionId: string): CashMovement[];
  registerIdentity(): RegisterIdentity | undefined;
  recordOpenedSession(session: OpenedCashSession): void;
  recordClosedSession(session: ClosedCashSession): void;
  recordCashMovement(movement: CashMovement): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}
