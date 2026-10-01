import type { OutboxEventDraft } from "../../sync/index.js";
import type { PreEmissionGateFailureReason } from "./pre-emission-gate.js";

export interface PreEmissionGateFailure {
  eventId: string;
  saleId: string;
  registerId: string;
  actorId: string;
  reason: PreEmissionGateFailureReason;
  evaluatedAt: Date;
}

export function preEmissionGateFailedEvent({
  eventId,
  saleId,
  registerId,
  actorId,
  reason,
  evaluatedAt,
}: PreEmissionGateFailure): OutboxEventDraft {
  const evaluatedAtIso = evaluatedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "fiscal_gate_failed",
    schema_version: 1,
    payload: {
      sale_id: saleId,
      register_id: registerId,
      reason,
      evaluated_at: evaluatedAtIso,
    },
    occurred_at: evaluatedAtIso,
    actor_id: actorId,
  };
}
