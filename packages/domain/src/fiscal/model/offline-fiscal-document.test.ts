import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import {
  OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE,
  offlineCreditNote,
  offlineCreditNoteIssuedEvent,
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
      schema_version: 2,
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
        document: {
          invoice_class: "C",
          total: 12_500,
          net_amount: 12_500,
          vat_amount: 0,
          issuer: {
            legal_name: FICTIONAL_LEGAL_NAME,
            cuit: FICTIONAL_CUIT,
            tax_status: "MONOTRIBUTO",
            gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
            activity_start_date: "2020-01-01",
            version: 3,
          },
          buyer_tax_status_code: 5,
          buyer_tax_status_description: "Consumidor Final",
        },
      },
      occurred_at: "2026-10-16T03:00:01.000Z",
      actor_id: "cashier",
    });
  });

  it("names its event type", () => {
    expect(OFFLINE_FISCAL_DOCUMENT_ISSUED_EVENT_TYPE).toBe("offline_fiscal_document_issued");
  });
});

const CREDIT_NOTE_ISSUE = {
  id: "fiscal-document-2",
  saleId: "sale-1",
  creditNoteId: "credit-note-1",
  pointOfSale: 7,
  number: 12,
  issuedOn: "2026-10-15",
  generatedAt: GENERATED_AT,
  offlineAuthorizationCode: "71234567890123",
  fortnight: { start: "2026-10-01", end: "2026-10-15" },
  total: 6750,
  receiverTaxStatusCode: 5,
  corrects: { voucherType: 11, pointOfSale: 7, number: 101 },
  cause: "no_connectivity",
} as const;

describe("offlineCreditNote", () => {
  it("is a credit note C to a final consumer, stamped with its generation moment on Argentina's clock", () => {
    expect(offlineCreditNote(CREDIT_NOTE_ISSUE)).toEqual({
      ...CREDIT_NOTE_ISSUE,
      documentType: "credit_note_c",
      generationStamp: "20261016000001",
      buyerDocumentType: 99,
      buyerDocumentNumber: 0,
    });
  });
});

describe("offlineCreditNoteIssuedEvent", () => {
  it("drafts a Sale event in version 3 carrying the credit note and the voucher it corrects", () => {
    expect(
      offlineCreditNoteIssuedEvent({
        eventId: "event-2",
        registerId: "register-1",
        actorId: "cashier",
        document: offlineCreditNote(CREDIT_NOTE_ISSUE),
      }),
    ).toEqual({
      event_id: "event-2",
      aggregate_type: "Sale",
      aggregate_id: "sale-1",
      event_type: "offline_fiscal_document_issued",
      schema_version: 3,
      payload: {
        fiscal_document_id: "fiscal-document-2",
        sale_id: "sale-1",
        register_id: "register-1",
        point_of_sale: 7,
        document_type: "credit_note_c",
        number: 12,
        issued_on: "2026-10-15",
        generated_at: "2026-10-16T03:00:01.000Z",
        generation_stamp: "20261016000001",
        offline_authorization_code: "71234567890123",
        fortnight_start: "2026-10-01",
        fortnight_end: "2026-10-15",
        buyer_document_type: 99,
        buyer_document_number: 0,
        buyer_tax_status_code: 5,
        total: 6750,
        net_amount: 6750,
        cause: "no_connectivity",
        credit_note_id: "credit-note-1",
        corrects: { voucher_type: 11, point_of_sale: 7, number: 101 },
        document: {
          id: "credit-note-1",
          total: 6750,
          receiver_tax_status_code: 5,
          corrects: { voucher_type: 11, point_of_sale: 7, number: 101 },
        },
      },
      occurred_at: "2026-10-16T03:00:01.000Z",
      actor_id: "cashier",
    });
  });
});
