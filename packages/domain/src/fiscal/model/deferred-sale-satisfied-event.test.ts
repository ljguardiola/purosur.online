import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import { deferredSaleSatisfiedEvent } from "./deferred-sale-satisfied-event.js";
import type { FacturaC } from "./pre-emission-gate.js";

const INVOICE: FacturaC = {
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
};

describe("deferredSaleSatisfiedEvent", () => {
  it("drafts a Sale event naming the record, the document that satisfied it and when", () => {
    expect(
      deferredSaleSatisfiedEvent({
        eventId: "event-1",
        registerId: "register-1",
        actorId: "cashier",
        deferredSaleId: "deferred-1",
        saleId: "sale-1",
        fiscalDocumentId: "document-1",
        pointOfSale: 7,
        number: 42,
        issuedOn: "2026-10-02",
        document: INVOICE,
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-12",
        reservedAt: new Date("2026-10-04T14:59:58.000Z"),
        satisfiedAt: new Date("2026-10-04T15:00:00.000Z"),
      }),
    ).toEqual({
      event_id: "event-1",
      aggregate_type: "Sale",
      aggregate_id: "sale-1",
      event_type: "deferred_sale_satisfied",
      schema_version: 1,
      payload: {
        id: "deferred-1",
        sale_id: "sale-1",
        register_id: "register-1",
        fiscal_document_id: "document-1",
        point_of_sale: 7,
        number: 42,
        issued_on: "2026-10-02",
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
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-12",
        reserved_at: "2026-10-04T14:59:58.000Z",
        satisfied_at: "2026-10-04T15:00:00.000Z",
      },
      occurred_at: "2026-10-04T15:00:00.000Z",
      actor_id: "cashier",
    });
  });
});
