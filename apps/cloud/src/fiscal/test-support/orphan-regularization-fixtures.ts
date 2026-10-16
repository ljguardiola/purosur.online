import type { OrphanRegularization } from "@purosur/domain/fiscal/use-cases";

export const OPENED_AT = new Date("2026-10-06T15:05:00.000Z");

export function creditNoteRegularization(
  overrides: Partial<Extract<OrphanRegularization, { kind: "credit_note" }>> = {},
): Extract<OrphanRegularization, { kind: "credit_note" }> {
  return {
    kind: "credit_note",
    creditNoteId: crypto.randomUUID(),
    saleId: crypto.randomUUID(),
    pointOfSale: 7,
    associatedVoucher: { voucherType: 11, pointOfSale: 7, number: 42 },
    keptVoucher: { voucherType: 11, pointOfSale: 9, number: 3 },
    total: 12_500,
    receiverTaxStatusCode: 5,
    ...overrides,
  };
}

export function externalInvoicingRegularization(
  overrides: {
    pointOfSale?: number;
    number?: number;
    documentType?: "factura_c" | "credit_note_c";
  } = {},
): Extract<OrphanRegularization, { kind: "external_invoicing" }> {
  const { pointOfSale = 7, number = 42, documentType = "factura_c" } = overrides;
  return {
    kind: "external_invoicing",
    externalBilling: { pointOfSale, documentType, number },
    task: {
      kind: "external_invoicing",
      state: "open",
      pointOfSale,
      documentType,
      number,
      voucher: { issuedOn: "2026-10-05", total: 12_500, authorizationCode: "74123456789012" },
      createdAt: OPENED_AT,
    },
  };
}
