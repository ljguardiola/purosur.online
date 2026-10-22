import type { OutboxEventDraft } from "../../shared/index.js";
import { invoiceRecord } from "./offline-fiscal-document.js";
import type { FacturaC } from "./pre-emission-gate.js";

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
  document: FacturaC;
  authorizationCode: string;
  authorizationCodeDueOn: string;
  reservedAt: Date;
  satisfiedAt: Date;
}

export interface DeferredSaleSatisfiedFact {
  id: string;
  saleId: string;
  fiscalDocumentId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  authorizationCode: string;
  authorizationCodeDueOn: string;
  reservedAt: Date;
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
  document,
  authorizationCode,
  authorizationCodeDueOn,
  reservedAt,
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
      document: invoiceRecord(document),
      authorization_code: authorizationCode,
      authorization_code_due_on: authorizationCodeDueOn,
      reserved_at: reservedAt.toISOString(),
      satisfied_at: satisfiedAtIso,
    },
    occurred_at: satisfiedAtIso,
    actor_id: actorId,
  };
}
