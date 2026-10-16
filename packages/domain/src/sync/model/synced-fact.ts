import type {
  ClockCorrectedFact,
  OfflineFiscalDocumentIssuedFact,
  PreEmissionGateFailureReason,
} from "../../fiscal/index.js";
import { approvedPaymentsCoverTotal, refundsSettleApprovedPayments } from "../../payments/index.js";
import type {
  CashMovementRecordedFact,
  CashSessionClosedFact,
  CashSessionOpenedFact,
} from "../../register/index.js";
import {
  type CancelledSale,
  type CompletedSale,
  type SalePrintState,
  type SaleReprint,
  stockMovementsMatchLines,
  type VoidedSale,
} from "../../sales/index.js";
import type { OpeningCountRecordedFact, OpeningCountWithdrawnFact } from "../../stock/index.js";
import type { InvariantBreak } from "./event-invariant-breaks.js";

export type SyncedFact =
  | { kind: "sale_completed"; sale: CompletedSale }
  | { kind: "sale_cancelled"; sale: CancelledSale }
  | { kind: "sale_voided"; sale: VoidedSale }
  | { kind: "sale_print_state_changed"; printState: SalePrintState }
  | { kind: "reprint_recorded"; reprint: SaleReprint }
  | { kind: "cash_session_opened"; session: CashSessionOpenedFact }
  | { kind: "cash_session_closed"; session: CashSessionClosedFact }
  | { kind: "cash_movement_recorded"; movement: CashMovementRecordedFact }
  | { kind: "opening_count_recorded"; count: OpeningCountRecordedFact }
  | { kind: "opening_count_withdrawn"; withdrawal: OpeningCountWithdrawnFact }
  | {
      kind: "qr_payment_replaced";
      replacement: { paymentTransactionId: string; saleId: string };
    }
  | {
      kind: "fiscal_gate_failed";
      gateFailure: { saleId: string; reason: PreEmissionGateFailureReason; evaluatedAt: Date };
    }
  | { kind: "offline_fiscal_document_issued"; document: OfflineFiscalDocumentIssuedFact }
  | { kind: "clock_corrected"; correction: ClockCorrectedFact };

export interface AggregateKey {
  aggregateType: string;
  aggregateId: string;
}

export function dependenciesOf(fact: SyncedFact): AggregateKey[] {
  if (
    fact.kind === "sale_completed" ||
    fact.kind === "sale_cancelled" ||
    fact.kind === "sale_voided"
  ) {
    return [{ aggregateType: "CashSession", aggregateId: fact.sale.sessionId }];
  }
  if (fact.kind === "opening_count_withdrawn") {
    return [{ aggregateType: "StockMovement", aggregateId: fact.withdrawal.withdrawnMovementId }];
  }
  return [];
}

export function invariantBreaksOf(fact: SyncedFact): InvariantBreak[] {
  if (fact.kind === "sale_completed") {
    return completedSaleBreaks(fact.sale);
  }
  if (
    fact.kind === "sale_cancelled" &&
    !refundsSettleApprovedPayments(fact.sale.payments, fact.sale.refunds)
  ) {
    return ["refunds_do_not_match_payments"];
  }
  if (fact.kind === "sale_voided") {
    return voidedSaleBreaks(fact.sale);
  }
  return [];
}

function voidedSaleBreaks(sale: VoidedSale): InvariantBreak[] {
  const breaks: InvariantBreak[] = [];
  if (!refundsSettleApprovedPayments(sale.payments, sale.refunds)) {
    breaks.push("refunds_do_not_match_payments");
  }
  const sold = sale.stockMovements.map((movement) => ({ ...movement, delta: -movement.delta }));
  if (!stockMovementsMatchLines(sale.lines, sold)) {
    breaks.push("stock_movements_do_not_match_lines");
  }
  return breaks;
}

function completedSaleBreaks(sale: CompletedSale): InvariantBreak[] {
  const breaks: InvariantBreak[] = [];
  if (!approvedPaymentsCoverTotal(sale)) {
    breaks.push("approved_payments_below_total");
  }
  if (sale.stockMovements !== null && !stockMovementsMatchLines(sale.lines, sale.stockMovements)) {
    breaks.push("stock_movements_do_not_match_lines");
  }
  return breaks;
}
