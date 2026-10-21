import type { JsonValue, OutboxEventDraft } from "../../shared/index.js";
import {
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
} from "./factura-c-fiscal-block.js";
import { FACTURA_C_DOCUMENT_TYPE, type FiscalDocumentType } from "./fiscal-rejection-standing.js";
import { generationStampOf } from "./generation-stamp.js";
import type { Fortnight } from "./offline-authorization-code.js";
import type { FacturaC } from "./pre-emission-gate.js";
import type { OfflineAuthorizationCause } from "./real-time-authorization.js";

export const OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE = "offline_fiscal_document_issued";

export interface OfflineFiscalDocumentIssue {
  id: string;
  saleId: string;
  pointOfSale: number;
  number: number;
  issuedOn: string;
  generatedAt: Date;
  offlineAuthorizationCode: string;
  fortnight: Fortnight;
  document: FacturaC;
  cause: OfflineAuthorizationCause;
}

export interface OfflineFiscalDocument extends OfflineFiscalDocumentIssue {
  documentType: FiscalDocumentType;
  generationStamp: string;
  buyerDocumentType: number;
  buyerDocumentNumber: number;
}

export function offlineFiscalDocument(issue: OfflineFiscalDocumentIssue): OfflineFiscalDocument {
  return {
    ...issue,
    documentType: FACTURA_C_DOCUMENT_TYPE,
    generationStamp: generationStampOf(issue.generatedAt),
    buyerDocumentType: FINAL_CONSUMER_DOCUMENT_TYPE,
    buyerDocumentNumber: FINAL_CONSUMER_DOCUMENT_NUMBER,
  };
}

export interface OfflineFiscalDocumentIssuedFact {
  fiscalDocumentId: string;
  saleId: string;
  registerId: string;
  pointOfSale: number;
  documentType: FiscalDocumentType;
  number: number;
  issuedOn: string;
  generatedAt: Date;
  generationStamp: string;
  offlineAuthorizationCode: string;
  fortnightStart: string;
  fortnightEnd: string;
  buyerDocumentType: number;
  buyerDocumentNumber: number;
  buyerTaxStatusCode: number;
  total: number;
  netAmount: number;
  cause: OfflineAuthorizationCause;
  invoice?: FacturaC;
}

function invoiceRecord(invoice: FacturaC): JsonValue {
  return {
    invoice_class: invoice.invoiceClass,
    total: invoice.total,
    net_amount: invoice.netAmount,
    vat_amount: invoice.vatAmount,
    issuer: {
      legal_name: invoice.issuer.legalName,
      cuit: invoice.issuer.cuit,
      tax_status: invoice.issuer.taxStatus,
      gross_income_registration: invoice.issuer.grossIncomeRegistration,
      activity_start_date: invoice.issuer.activityStartDate,
      version: invoice.issuer.version,
    },
    buyer_tax_status_code: invoice.buyerTaxStatusCode,
    buyer_tax_status_description: invoice.buyerTaxStatusDescription,
  };
}

export interface OfflineFiscalDocumentIssuedEventInput {
  eventId: string;
  registerId: string;
  actorId: string;
  document: OfflineFiscalDocument;
}

export function offlineFiscalDocumentIssuedEvent({
  eventId,
  registerId,
  actorId,
  document,
}: OfflineFiscalDocumentIssuedEventInput): OutboxEventDraft {
  const generatedAt = document.generatedAt.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "Sale",
    aggregate_id: document.saleId,
    event_type: OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE,
    schema_version: 2,
    payload: {
      fiscal_document_id: document.id,
      sale_id: document.saleId,
      register_id: registerId,
      point_of_sale: document.pointOfSale,
      document_type: document.documentType,
      number: document.number,
      issued_on: document.issuedOn,
      generated_at: generatedAt,
      generation_stamp: document.generationStamp,
      offline_authorization_code: document.offlineAuthorizationCode,
      fortnight_start: document.fortnight.start,
      fortnight_end: document.fortnight.end,
      buyer_document_type: document.buyerDocumentType,
      buyer_document_number: document.buyerDocumentNumber,
      buyer_tax_status_code: document.document.buyerTaxStatusCode,
      total: document.document.total,
      net_amount: document.document.netAmount,
      cause: document.cause,
      document: invoiceRecord(document.document),
    },
    occurred_at: generatedAt,
    actor_id: actorId,
  };
}
