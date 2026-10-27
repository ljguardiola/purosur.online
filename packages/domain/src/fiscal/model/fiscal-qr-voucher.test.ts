import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FICTIONAL_CUIT } from "../test-support/fictional-tax-identities.js";
import { facturaCFiscalBlock, TAX_AUTHORITY_QR_URL } from "./factura-c-fiscal-block.js";
import { fiscalQrVoucher } from "./fiscal-qr-voucher.js";

function qrOf(payload: unknown): string {
  return `${TAX_AUTHORITY_QR_URL}${btoa(JSON.stringify(payload))}`;
}

const PAYLOAD = { ver: 1, ptoVta: 3, tipoCmp: 11, nroCmp: 1204, importe: 15.5 };

function invoiceQr(pointOfSale: number, number: number): string {
  return facturaCFiscalBlock({
    pointOfSale,
    number,
    issuedOn: "2026-10-01",
    authorizationCode: "71234567890123",
    authorizationCodeDueOn: "2026-10-11",
    document: {
      invoiceClass: "C",
      total: 5900,
      netAmount: 5900,
      vatAmount: 0,
      issuer: {
        legalName: "Comercio de prueba",
        cuit: FICTIONAL_CUIT,
        taxStatus: "Responsable Monotributo",
        grossIncomeRegistration: "123",
        activityStartDate: "2020-01-15",
        version: 3,
      },
      buyerTaxStatusCode: 5,
      buyerTaxStatusDescription: "Consumidor Final",
    },
  }).qrText;
}

describe("fiscalQrVoucher", () => {
  it("reads the point of sale, voucher type and number the tax authority's QR carries", () => {
    expect(fiscalQrVoucher(qrOf(PAYLOAD))).toEqual({
      pointOfSale: 3,
      voucherType: 11,
      number: 1204,
    });
  });

  it("reads back what the factura C's own QR was generated from, for any point of sale and number", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99_999 }),
        fc.integer({ min: 1, max: 99_999_999 }),
        (pointOfSale, number) => {
          expect(fiscalQrVoucher(invoiceQr(pointOfSale, number))).toEqual({
            pointOfSale,
            voucherType: 11,
            number,
          });
        },
      ),
    );
  });

  it("reads a payload whose base64 padding arrived percent-encoded", () => {
    const body = btoa(JSON.stringify({ ptoVta: 3, tipoCmp: 11, nroCmp: 1204, x: "abc" }));
    expect(body.endsWith("=")).toBe(true);

    expect(fiscalQrVoucher(`${TAX_AUTHORITY_QR_URL}${body.replaceAll("=", "%3D")}`)).toEqual({
      pointOfSale: 3,
      voucherType: 11,
      number: 1204,
    });
  });

  it.each([
    ["text of another kind", "purosur-deferred-sale:0198-abc:7KQ4M2P9"],
    ["an empty text", ""],
    ["the tax authority's address without a payload", TAX_AUTHORITY_QR_URL],
    ["another address", `https://example.com/fe/qr/?p=${btoa(JSON.stringify(PAYLOAD))}`],
    [
      "an address of the same length as the tax authority's",
      `${TAX_AUTHORITY_QR_URL.replace("arca", "arcb")}${btoa(JSON.stringify(PAYLOAD))}`,
    ],
    ["a payload that is not base64", `${TAX_AUTHORITY_QR_URL}%%%`],
    ["a payload that is not JSON", `${TAX_AUTHORITY_QR_URL}${btoa("not json")}`],
    ["a payload that is not an object", qrOf([3, 11, 1204])],
    ["a payload that is null", qrOf(null)],
    ["a payload without a point of sale", qrOf({ tipoCmp: 11, nroCmp: 1204 })],
    ["a payload without a voucher type", qrOf({ ptoVta: 3, nroCmp: 1204 })],
    ["a payload without a number", qrOf({ ptoVta: 3, tipoCmp: 11 })],
    ["a point of sale that is not a number", qrOf({ ...PAYLOAD, ptoVta: "3" })],
    ["a point of sale that is zero", qrOf({ ...PAYLOAD, ptoVta: 0 })],
    ["a point of sale that is negative", qrOf({ ...PAYLOAD, ptoVta: -3 })],
    ["a point of sale with decimals", qrOf({ ...PAYLOAD, ptoVta: 3.5 })],
    ["a voucher type that is zero", qrOf({ ...PAYLOAD, tipoCmp: 0 })],
    ["a voucher type with decimals", qrOf({ ...PAYLOAD, tipoCmp: 11.5 })],
    ["a number that is zero", qrOf({ ...PAYLOAD, nroCmp: 0 })],
    ["a number that is negative", qrOf({ ...PAYLOAD, nroCmp: -1 })],
    ["a number with decimals", qrOf({ ...PAYLOAD, nroCmp: 1.5 })],
    ["a number beyond what can be counted exactly", qrOf({ ...PAYLOAD, nroCmp: 2 ** 60 })],
  ])("answers nothing for %s", (_description, text) => {
    expect(fiscalQrVoucher(text)).toBeNull();
  });
});
