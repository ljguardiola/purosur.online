import type { OutboxEventDraft } from "../../sync/index.js";
import type { BuyerTaxStatusOption } from "./buyer-tax-status-set.js";
import {
  type IssuerIdentificationInEffect,
  type PreEmissionGateOutcome,
  preEmissionGate,
} from "./pre-emission-gate.js";

export interface RecordedPreEmissionGate {
  saleId: string;
  evaluatedAt: Date;
  outcome: PreEmissionGateOutcome;
}

export interface PreEmissionGateRecorder {
  issuerIdentificationInEffect(): IssuerIdentificationInEffect | undefined;
  buyerTaxStatusSetInEffect(): readonly BuyerTaxStatusOption[] | undefined;
  recordPreEmissionGate(recorded: RecordedPreEmissionGate): void;
  appendOutboxEvent(draft: OutboxEventDraft): void;
}

export interface SaleToGate {
  id: string;
  registerId: string;
  actorId: string;
  total: number;
}

export function evaluatePreEmissionGateOfSale(
  recorder: PreEmissionGateRecorder,
  sale: SaleToGate,
  evaluatedAt: Date,
  eventIds: { next(): string },
): PreEmissionGateOutcome {
  const outcome = preEmissionGate({
    total: sale.total,
    issuer: recorder.issuerIdentificationInEffect(),
    buyerTaxStatuses: recorder.buyerTaxStatusSetInEffect(),
  });
  recorder.recordPreEmissionGate({ saleId: sale.id, evaluatedAt, outcome });
  if (outcome.kind === "failed") {
    recorder.appendOutboxEvent(
      fiscalGateFailedEvent(eventIds.next(), sale, outcome.reason, evaluatedAt),
    );
  }
  return outcome;
}

function fiscalGateFailedEvent(
  eventId: string,
  sale: SaleToGate,
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
