import type { OutboxEventDraft } from "../../shared/index.js";
import type { DeferredSale } from "./deferred-sale.js";

export interface DeferredSaleRecorded {
  eventId: string;
  registerId: string;
  actorId: string;
  deferredSale: DeferredSale;
}

export function deferredSaleRecordedEvent({
  eventId,
  registerId,
  actorId,
  deferredSale,
}: DeferredSaleRecorded): OutboxEventDraft {
  const routedAt = deferredSale.routedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: deferredSale.saleId,
    event_type: "deferred_sale_recorded",
    schema_version: 1,
    payload: {
      id: deferredSale.id,
      sale_id: deferredSale.saleId,
      register_id: registerId,
      occurred_at: deferredSale.occurredAt.toISOString(),
      total: deferredSale.total,
      reason: deferredSale.reason,
      short_code: deferredSale.shortCode,
      routed_at: routedAt,
    },
    occurred_at: routedAt,
    actor_id: actorId,
  };
}
