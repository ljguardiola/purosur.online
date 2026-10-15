import { describe, expect, it } from "vitest";
import { facturaCDetail } from "./wsfe-factura-c-detail.js";

const source = {
  number: 42,
  issuedOn: "2026-10-06",
  total: 12_550,
  netAmount: 12_000,
  buyerDocumentType: 99,
  buyerDocumentNumber: 0,
  buyerTaxStatusCode: 5,
};

describe("facturaCDetail", () => {
  it("describes one Factura C of products, in pesos, with no VAT, taxes or exempt amounts", () => {
    expect(facturaCDetail(source)).toEqual({
      Concepto: 1,
      DocTipo: 99,
      DocNro: 0,
      CbteDesde: 42,
      CbteHasta: 42,
      CbteFch: "20261006",
      ImpTotal: "125.50",
      ImpTotConc: 0,
      ImpNeto: "120.00",
      ImpOpEx: 0,
      ImpTrib: 0,
      ImpIVA: 0,
      MonId: "PES",
      MonCotiz: 1,
      CondicionIVAReceptorId: 5,
    });
  });

  it("carries the buyer's document and tax status as they are given", () => {
    expect(
      facturaCDetail({
        ...source,
        buyerDocumentType: 96,
        buyerDocumentNumber: 30_111_222,
        buyerTaxStatusCode: 6,
      }),
    ).toMatchObject({ DocTipo: 96, DocNro: 30_111_222, CondicionIVAReceptorId: 6 });
  });

  it.each([
    [1_999, "19.99"],
    [5, "0.05"],
    [100, "1.00"],
    [0, "0.00"],
  ])("writes %i cents as %s pesos, without a rounding error", (cents, pesos) => {
    expect(facturaCDetail({ ...source, total: cents, netAmount: cents })).toMatchObject({
      ImpTotal: pesos,
      ImpNeto: pesos,
    });
  });
});
