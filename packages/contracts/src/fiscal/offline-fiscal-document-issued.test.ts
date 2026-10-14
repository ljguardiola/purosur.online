import { offlineFiscalDocument, offlineFiscalDocumentIssuedEvent } from "@purosur/domain";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { offlineFiscalDocumentIssuedSchema } from "./offline-fiscal-document-issued.js";

const { payload } = offlineFiscalDocumentIssuedEvent({
  eventId: "event-1",
  registerId: "register-1",
  actorId: "cashier",
  document: offlineFiscalDocument({
    id: "fiscal-document-1",
    saleId: "sale-1",
    pointOfSale: 7,
    number: 101,
    issuedOn: "2026-10-15",
    generatedAt: new Date("2026-10-16T03:00:01.000Z"),
    offlineAuthorizationCode: "71234567890123",
    fortnight: { start: "2026-10-01", end: "2026-10-15" },
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
    cause: "no_connectivity",
  }),
});

function accepts(candidate: unknown): boolean {
  return offlineFiscalDocumentIssuedSchema.safeParse(candidate).success;
}

describe("offlineFiscalDocumentIssuedSchema", () => {
  it("describes the event the domain drafts for a document issued under a pre-obtained code", () => {
    expect(offlineFiscalDocumentIssuedSchema.parse(payload)).toEqual(payload);
  });

  it.each(Object.keys(payload))("refuses a payload without its %s", (field) => {
    const { [field]: _removed, ...rest } = payload;
    expect(accepts(rest)).toBe(false);
  });

  it.each([
    ["a cause nobody recorded", { cause: "tired" }],
    ["a generation stamp that is not fourteen digits", { generation_stamp: "2026-10-16" }],
    ["a generation moment that is not an instant", { generated_at: "yesterday" }],
    ["an issue date that is not a calendar day", { issued_on: "2026-13-01" }],
    ["a fortnight start that is not a calendar day", { fortnight_start: "soon" }],
    ["a fractional total", { total: 10.5 }],
    ["a negative net amount", { net_amount: -1 }],
    ["a point of sale the tax authority does not allow", { point_of_sale: 0 }],
    ["a number that is not positive", { number: 0 }],
    ["a document type other than factura C", { document_type: "factura_a" }],
  ])("refuses %s", (_case, change) => {
    expect(accepts({ ...payload, ...change })).toBe(false);
  });

  it.each(["no_connectivity", "unclear_outcome", "numbering_conflict"])(
    "accepts the cause %s",
    (cause) => {
      expect(accepts({ ...payload, cause })).toBe(true);
    },
  );
});
