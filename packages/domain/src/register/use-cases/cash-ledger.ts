import type { RoleAccess } from "../../permissions/index.js";
import type { SaleDiscount, SaleLine } from "../../sales/index.js";
import type { IdGenerator, OutboxEventDraft, RegisterIdentity } from "../../shared/index.js";
import type { CashMovement, ClosedCashSession, OpenedCashSession } from "../model/cash-session.js";

export type { IdGenerator, RegisterIdentity };

export interface OpenSale {
  lines: Pick<SaleLine, "lineTotal">[];
  saleDiscount: SaleDiscount | null;
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
