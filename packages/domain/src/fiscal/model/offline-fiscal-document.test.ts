import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import {
  OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE,
  offlineFiscalDocument,
  offlineFiscalDocumentIssuedEvent,
} from "./offline-fiscal-document.js";

const DOCUMENT = {
  invoiceClass: "C",
  total: 12_500,
  netAmount: 12_500,
  vatAmount: 0,
  issuer: {
    legalName: FICTIONAL_LEGAL_NAME,
    cuit: FICTIONAL_CUIT,
    taxStatus: "MONOTRIBUTO",
    grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activityStartDate: "2020-01-01",
    version: 3,
  },
  buyerTaxStatusCode: 5,
  buyerTaxStatusDescription: "Consumidor Final",
} as const;

const GENERATED_AT = new Date("2026-10-16T03:00:01.000Z");

function issued() {
  return offlineFiscalDocument({
    id: "fiscal-document-1",
    saleId: "sale-1",
    pointOfSale: 7,
    number: 101,
    issuedOn: "2026-10-15",
    generatedAt: GENERATED_AT,
    offlineAuthorizationCode: "71234567890123",
    fortnight: { start: "2026-10-01", end: "2026-10-15" },
    document: DOCUMENT,
    cause: "unclear_outcome",
  });
}

describe("offlineFiscalDocument", () => {
  it("is a factura C to a final consumer, stamped with its generation moment on Argentina's clock", () => {
    expect(issued()).toEqual({
      id: "fiscal-document-1",
      saleId: "sale-1",
      pointOfSale: 7,
      documentType: "factura_c",
      number: 101,
      issuedOn: "2026-10-15",
      generatedAt: GENERATED_AT,
      generationStamp: "20261016000001",
      offlineAuthorizationCode: "71234567890123",
      fortnight: { start: "2026-10-01", end: "2026-10-15" },
      document: DOCUMENT,
      buyerDocumentType: 99,
      buyerDocumentNumber: 0,
      cause: "unclear_outcome",
    });
  });
});

describe("offlineFiscalDocumentIssuedEvent", () => {
  it("drafts a Sale event carrying everything needed to report the document later", () => {
    expect(
      offlineFiscalDocumentIssuedEvent({
        eventId: "event-1",
        registerId: "register-1",
        actorId: "cashier",
        document: issued(),
      }),
    ).toEqual({
      event_id: "event-1",
      aggregate_type: "Sale",
      aggregate_id: "sale-1",
      event_type: "offline_fiscal_document_issued",
      schema_version: 1,
      payload: {
        fiscal_document_id: "fiscal-document-1",
        sale_id: "sale-1",
        register_id: "register-1",
        point_of_sale: 7,
        document_type: "factura_c",
        number: 101,
        issued_on: "2026-10-15",
        generated_at: "2026-10-16T03:00:01.000Z",
        generation_stamp: "20261016000001",
        offline_authorization_code: "71234567890123",
        fortnight_start: "2026-10-01",
        fortnight_end: "2026-10-15",
        buyer_document_type: 99,
        buyer_document_number: 0,
        buyer_tax_status_code: 5,
        total: 12_500,
        net_amount: 12_500,
        cause: "unclear_outcome",
      },
      occurred_at: "2026-10-16T03:00:01.000Z",
      actor_id: "cashier",
    });
  });

  it("names its event type", () => {
    expect(OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE).toBe("offline_fiscal_document_issued");
  });
});
