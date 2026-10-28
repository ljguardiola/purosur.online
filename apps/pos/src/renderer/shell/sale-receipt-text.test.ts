import { describe, expect, it } from "vitest";
import {
  comprobantePresentation,
  creditNoteComprobantePresentation,
  receiptCopyPresentation,
} from "./sale-receipt-text";

describe("comprobantePresentation", () => {
  it("names a fiscal invoice with its point of sale and number padded to the digits the tax authority prints", () => {
    expect(
      comprobantePresentation({
        kind: "fiscal",
        document_type: "factura_c",
        authorization: "real_time",
        point_of_sale: 3,
        number: 1248,
      }),
    ).toEqual({ name: "Factura C", detail: "PV 00003 · Nº 00001248" });
  });

  it("names a fiscal invoice authorized under the pre-obtained code as such, with the same point of sale and number", () => {
    expect(
      comprobantePresentation({
        kind: "fiscal",
        document_type: "factura_c",
        authorization: "offline_code",
        point_of_sale: 3,
        number: 1248,
      }),
    ).toEqual({ name: "Factura C · CAEA", detail: "PV 00003 · Nº 00001248" });
  });

  it("names a deferred sale's document as not fiscal and says it still has to be invoiced", () => {
    expect(comprobantePresentation({ kind: "deferred_non_fiscal" })).toEqual({
      name: "Documento no fiscal",
      detail: "Venta diferida · falta facturar",
    });
  });

  it("has nothing to name when the sale has no comprobante", () => {
    expect(comprobantePresentation({ kind: "none" })).toBeUndefined();
  });
});

describe("creditNoteComprobantePresentation", () => {
  it("names an authorized credit note with its point of sale and number padded to the digits the tax authority prints", () => {
    expect(
      creditNoteComprobantePresentation({
        kind: "authorized",
        point_of_sale: 4,
        number: 12,
        issued_on: "2026-10-09",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-19",
      }),
    ).toEqual({ name: "Nota de crédito C", detail: "PV 00004 · Nº 00000012" });
  });
});

describe("creditNoteComprobantePresentation of a credit note issued under the contingency code", () => {
  it("names it as the invoice issued under a contingency code is named, with its point of sale and number", () => {
    expect(
      creditNoteComprobantePresentation({
        kind: "issued_offline",
        point_of_sale: 9,
        number: 41,
        issued_on: "2026-10-09",
        offline_authorization_code: "71234567890123",
        fortnight_start: "2026-10-01",
        fortnight_end: "2026-10-15",
      }),
    ).toEqual({ name: "Nota de crédito C · CAEA", detail: "PV 00009 · Nº 00000041" });
  });

  it("marks the contingency code after the name it is given", () => {
    expect(
      creditNoteComprobantePresentation(
        {
          kind: "issued_offline",
          point_of_sale: 9,
          number: 41,
          issued_on: "2026-10-09",
          offline_authorization_code: "71234567890123",
          fortnight_start: "2026-10-01",
          fortnight_end: "2026-10-15",
        },
        "Nota de crédito C de devolución",
      ).name,
    ).toBe("Nota de crédito C de devolución · CAEA");
  });
});

describe("receiptCopyPresentation", () => {
  it("says the next copy is an original, to be printed", () => {
    expect(receiptCopyPresentation({ kind: "original" })).toEqual({
      printButton: "Imprimir original",
      comesOutAs: "Sale como original",
      legend: undefined,
    });
  });

  it("says the next copy is a duplicate with the legend it carries and its reprint number", () => {
    expect(receiptCopyPresentation({ kind: "duplicate", order_number: 2 })).toEqual({
      printButton: "Reimprimir duplicado",
      comesOutAs: "Sale como duplicado",
      legend: "COPIA DUPLICADA Nº 2",
    });
  });

  it("carries no legend for a duplicate whose reprint number is not known yet", () => {
    expect(receiptCopyPresentation({ kind: "duplicate" })).toEqual({
      printButton: "Reimprimir duplicado",
      comesOutAs: "Sale como duplicado",
      legend: undefined,
    });
  });
});
