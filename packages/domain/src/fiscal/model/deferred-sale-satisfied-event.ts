import type { OutboxEventDraft } from "../../shared/index.js";

export interface DeferredSaleSatisfied {
  eventId: string;
  registerId: string;
  actorId: string;
  deferredSaleId: string;
  saleId: string;
  fiscalDocumentId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  satisfiedAt: Date;
}

export function deferredSaleSatisfiedEvent({
  eventId,
  registerId,
  actorId,
  deferredSaleId,
  saleId,
  fiscalDocumentId,
  pointOfSale,
  number,
  issuedOn,
  satisfiedAt,
}: DeferredSaleSatisfied): OutboxEventDraft {
  const satisfiedAtIso = satisfiedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: saleId,
    event_type: "deferred_sale_satisfied",
    schema_version: 1,
    payload: {
      id: deferredSaleId,
      sale_id: saleId,
      register_id: registerId,
      fiscal_document_id: fiscalDocumentId,
      point_of_sale: pointOfSale,
      number,
      issued_on: issuedOn,
      satisfied_at: satisfiedAtIso,
    },
    occurred_at: satisfiedAtIso,
    actor_id: actorId,
  };
}
