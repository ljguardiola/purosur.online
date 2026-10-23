import type { OutboxEventDraft } from "../../shared/index.js";
import type { DeferredSale } from "./deferred-sale.js";
import { invoiceRecord } from "./offline-fiscal-document.js";
import type { FacturaC } from "./pre-emission-gate.js";

export interface UnclearDeferralDocument {
  fiscalDocumentId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  document: FacturaC;
  reservedAt: Date;
}

export interface DeferredSaleRecorded {
  eventId: string;
  registerId: string;
  actorId: string;
  deferredSale: DeferredSale;
  unclearDocument: UnclearDeferralDocument | null;
}

export function deferredSaleRecordedEvent({
  eventId,
  registerId,
  actorId,
  deferredSale,
  unclearDocument,
}: DeferredSaleRecorded): OutboxEventDraft {
  const routedAt = deferredSale.routedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: deferredSale.saleId,
    event_type: "deferred_sale_recorded",
    schema_version: 2,
    payload: {
      id: deferredSale.id,
      sale_id: deferredSale.saleId,
      register_id: registerId,
      occurred_at: deferredSale.occurredAt.toISOString(),
      total: deferredSale.total,
      reason: deferredSale.reason,
      short_code: deferredSale.shortCode,
      routed_at: routedAt,
      unclear_document:
        unclearDocument === null
          ? null
          : {
              fiscal_document_id: unclearDocument.fiscalDocumentId,
              point_of_sale: unclearDocument.pointOfSale,
              number: unclearDocument.number,
              issued_on: unclearDocument.issuedOn,
              document: invoiceRecord(unclearDocument.document),
              reserved_at: unclearDocument.reservedAt.toISOString(),
            },
    },
    occurred_at: routedAt,
    actor_id: actorId,
  };
}
