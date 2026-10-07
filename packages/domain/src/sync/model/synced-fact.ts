import type { PreEmissionGateFailureReason } from "../../fiscal/index.js";
import type {
  CashMovementRecordedFact,
  CashSessionClosedFact,
  CashSessionOpenedFact,
} from "../../register/index.js";
import { approvedPaymentsCoverTotal, type CompletedSale } from "../../sales/index.js";

export type SyncedFact =
  | { kind: "sale_completed"; sale: CompletedSale }
  | { kind: "cash_session_opened"; session: CashSessionOpenedFact }
  | { kind: "cash_session_closed"; session: CashSessionClosedFact }
  | { kind: "cash_movement_recorded"; movement: CashMovementRecordedFact }
  | {
      kind: "fiscal_gate_failed";
      gateFailure: { saleId: string; reason: PreEmissionGateFailureReason; evaluatedAt: Date };
    };

export interface AggregateKey {
  aggregateType: string;
  aggregateId: string;
}

export type InvariantBreak = "approved_payments_below_total";

export function dependenciesOf(fact: SyncedFact): AggregateKey[] {
  if (fact.kind === "sale_completed") {
    return [{ aggregateType: "CashSession", aggregateId: fact.sale.sessionId }];
  }
  return [];
}

export function invariantBreaksOf(fact: SyncedFact): InvariantBreak[] {
  if (fact.kind === "sale_completed" && !approvedPaymentsCoverTotal(fact.sale)) {
    return ["approved_payments_below_total"];
  }
  return [];
}
