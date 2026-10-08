import type { RoleAccess } from "../../access/index.js";
import type { SaleLine } from "../../sales/index.js";
import type { OutboxEventDraft } from "../../shared/index.js";
import type { CashMovement, ClosedCashSession, OpenedCashSession } from "../model/cash-session.js";

export interface RegisterIdentity {
  registerId: string;
  deviceId: string;
}

export interface IdGenerator {
  next(): string;
}

export interface OpenSale {
  lines: Pick<SaleLine, "lineTotal">[];
}

export interface CashLedger {
  transaction<TOutcome>(work: (tx: CashLedgerTransaction) => TOutcome): TOutcome;
}

export interface CashLedgerTransaction {
  openerAccess(userId: string): RoleAccess | undefined;
  openSession(): OpenedCashSession | undefined;
  openSale(sessionId: string): OpenSale | undefined;
  sessionMovements(sessionId: string): CashMovement[];
  registerIdentity(): RegisterIdentity | undefined;
  recordOpenedSession(session: OpenedCashSession): void;
  recordClosedSession(session: ClosedCashSession): void;
  recordCashMovement(movement: CashMovement): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}
