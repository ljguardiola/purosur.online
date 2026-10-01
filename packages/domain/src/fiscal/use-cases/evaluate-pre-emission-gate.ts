import { saleTotal } from "../../sales/index.js";
import type { OutboxEventDraft } from "../../sync/index.js";
import { type PreEmissionGateOutcome, preEmissionGate } from "../model/pre-emission-gate.js";
import type { Clock, CompletedSale, FiscalGateLedger, IdGenerator } from "./fiscal-gate-ledger.js";

export interface EvaluatePreEmissionGateInput {
  saleId: string;
}

export interface EvaluatePreEmissionGatePorts {
  ledger: FiscalGateLedger;
  clock: Clock;
  ids: IdGenerator;
}

export type EvaluatePreEmissionGateOutcome =
  | PreEmissionGateOutcome
  | { kind: "sale_not_completed" };

export function evaluatePreEmissionGate(
  { ledger, clock, ids }: EvaluatePreEmissionGatePorts,
  { saleId }: EvaluatePreEmissionGateInput,
): EvaluatePreEmissionGateOutcome {
  return ledger.transaction<EvaluatePreEmissionGateOutcome>((tx) => {
    const recorded = tx.recordedPreEmissionGate(saleId);
    if (recorded !== undefined) {
      return recorded.outcome;
    }
    const sale = tx.completedSale(saleId);
    if (sale === undefined) {
      return { kind: "sale_not_completed" };
    }

    const outcome = preEmissionGate({
      total: saleTotal(sale.lines),
      issuer: tx.issuerIdentificationInEffect(),
      buyerTaxStatuses: tx.buyerTaxStatusSetInEffect(),
    });
    const evaluatedAt = clock.now();
    tx.recordPreEmissionGate({ saleId, evaluatedAt, outcome });
    if (outcome.kind === "failed") {
      tx.appendOutboxEvent(fiscalGateFailedEvent(ids.next(), sale, outcome.reason, evaluatedAt));
    }
    return outcome;
  });
}

function fiscalGateFailedEvent(
  eventId: string,
  sale: CompletedSale,
  reason: string,
  evaluatedAt: Date,
): OutboxEventDraft {
  const evaluatedAtIso = evaluatedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: sale.id,
    event_type: "fiscal_gate_failed",
    schema_version: 1,
    payload: {
      sale_id: sale.id,
      register_id: sale.registerId,
      reason,
      evaluated_at: evaluatedAtIso,
    },
    occurred_at: evaluatedAtIso,
    actor_id: sale.actorId,
  };
}
