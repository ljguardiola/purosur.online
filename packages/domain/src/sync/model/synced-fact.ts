import type { PreEmissionGateFailureReason } from "../../fiscal/index.js";
import type {
  CashMovementRecordedFact,
  CashSessionClosedFact,
  CashSessionOpenedFact,
} from "../../register/index.js";
import {
  approvedPaymentsCoverTotal,
  type CancelledSale,
  type CompletedSale,
  refundsSettleApprovedPayments,
} from "../../sales/index.js";

export type SyncedFact =
  | { kind: "sale_completed"; sale: CompletedSale }
  | { kind: "sale_cancelled"; sale: CancelledSale }
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

export type InvariantBreak = "approved_payments_below_total" | "refunds_do_not_match_payments";

export function dependenciesOf(fact: SyncedFact): AggregateKey[] {
  if (fact.kind === "sale_completed" || fact.kind === "sale_cancelled") {
    return [{ aggregateType: "CashSession", aggregateId: fact.sale.sessionId }];
  }
  return [];
}

export function invariantBreaksOf(fact: SyncedFact): InvariantBreak[] {
  if (fact.kind === "sale_completed" && !approvedPaymentsCoverTotal(fact.sale)) {
    return ["approved_payments_below_total"];
  }
  if (
    fact.kind === "sale_cancelled" &&
    !refundsSettleApprovedPayments(fact.sale.payments, fact.sale.refunds)
  ) {
    return ["refunds_do_not_match_payments"];
  }
  return [];
}
