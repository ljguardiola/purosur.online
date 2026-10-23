import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import { deferredSaleRecordedEvent } from "./deferred-sale-recorded-event.js";

const DEFERRED_SALE = {
  id: "deferred-1",
  saleId: "sale-1",
  occurredAt: new Date("2026-10-02T02:30:00.000Z"),
  total: 12_500,
  reason: "fiscally_offline",
  shortCode: "7KQ4M2P9",
  routedAt: new Date("2026-10-02T02:30:01.000Z"),
} as const;

const UNCLEAR_DOCUMENT = {
  fiscalDocumentId: "document-1",
  pointOfSale: 7,
  number: 42,
  issuedOn: "2026-10-02",
  document: {
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
  },
  reservedAt: new Date("2026-10-02T02:29:58.000Z"),
} as const;

describe("deferredSaleRecordedEvent", () => {
  it("drafts a Sale event carrying the record, its short code and the register it belongs to", () => {
    expect(
      deferredSaleRecordedEvent({
        eventId: "event-1",
        registerId: "register-1",
        actorId: "cashier",
        deferredSale: DEFERRED_SALE,
        unclearDocument: null,
      }),
    ).toEqual({
      event_id: "event-1",
      aggregate_type: "Sale",
      aggregate_id: "sale-1",
      event_type: "deferred_sale_recorded",
      schema_version: 2,
      payload: {
        id: "deferred-1",
        sale_id: "sale-1",
        register_id: "register-1",
        occurred_at: "2026-10-02T02:30:00.000Z",
        total: 12_500,
        reason: "fiscally_offline",
        short_code: "7KQ4M2P9",
        routed_at: "2026-10-02T02:30:01.000Z",
        unclear_document: null,
      },
      occurred_at: "2026-10-02T02:30:01.000Z",
      actor_id: "cashier",
    });
  });

  it("carries the fiscal document an unclear outcome left waiting, so a restored register can settle it", () => {
    const { payload } = deferredSaleRecordedEvent({
      eventId: "event-1",
      registerId: "register-1",
      actorId: "cashier",
      deferredSale: { ...DEFERRED_SALE, reason: "unclear_outcome" },
      unclearDocument: UNCLEAR_DOCUMENT,
    });

    expect(payload).toMatchObject({
      reason: "unclear_outcome",
      unclear_document: {
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
        reserved_at: "2026-10-02T02:29:58.000Z",
      },
    });
  });
});
