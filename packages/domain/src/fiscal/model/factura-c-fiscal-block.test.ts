import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import {
  AUTHORIZATION_CODE_TYPE_CAE,
  type AuthorizedFacturaC,
  CURRENCY_PESOS,
  EXCHANGE_RATE_PESOS,
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
  facturaCFiscalBlock,
  TAX_AUTHORITY_QR_URL,
} from "./factura-c-fiscal-block.js";

function authorized(total: number): AuthorizedFacturaC {
  return {
    pointOfSale: 1,
    number: 123,
    issuedOn: "2026-10-01",
    authorizationCode: "71234567890123",
    authorizationCodeDueOn: "2026-10-11",
    document: {
      invoiceClass: "C",
      total,
      netAmount: total,
      vatAmount: 0,
      issuer: {
        legalName: FICTIONAL_LEGAL_NAME,
        cuit: FICTIONAL_CUIT,
        taxStatus: "Responsable Monotributo",
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2020-01-15",
        version: 3,
      },
      buyerTaxStatusCode: 5,
      buyerTaxStatusDescription: "Consumidor Final",
    },
  };
}

function qrPayload(qrText: string): unknown {
  expect(qrText.startsWith(TAX_AUTHORITY_QR_URL)).toBe(true);
  return JSON.parse(atob(qrText.slice(TAX_AUTHORITY_QR_URL.length)));
}

describe("ARCA codes", () => {
  it("names the codes the tax authority defines", () => {
    expect({
      FACTURA_C_VOUCHER_TYPE,
      FINAL_CONSUMER_DOCUMENT_TYPE,
      FINAL_CONSUMER_DOCUMENT_NUMBER,
      CURRENCY_PESOS,
      EXCHANGE_RATE_PESOS,
      AUTHORIZATION_CODE_TYPE_CAE,
      TAX_AUTHORITY_QR_URL,
    }).toStrictEqual({
      FACTURA_C_VOUCHER_TYPE: 11,
      FINAL_CONSUMER_DOCUMENT_TYPE: 99,
      FINAL_CONSUMER_DOCUMENT_NUMBER: 0,
      CURRENCY_PESOS: "PES",
      EXCHANGE_RATE_PESOS: 1,
      AUTHORIZATION_CODE_TYPE_CAE: "E",
      TAX_AUTHORITY_QR_URL: "https://www.arca.gob.ar/fe/qr/?p=",
    });
  });
});

describe("facturaCFiscalBlock", () => {
  it("carries the voucher, the issuer and the authorization it was composed with", () => {
    const block = facturaCFiscalBlock(authorized(5900));
    expect(block).toMatchObject({
      invoiceClass: "C",
      voucherTypeCode: 11,
      issuer: {
        legalName: FICTIONAL_LEGAL_NAME,
        cuit: FICTIONAL_CUIT,
        taxStatus: "Responsable Monotributo",
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2020-01-15",
      },
      buyerTaxStatusDescription: "Consumidor Final",
      pointOfSale: 1,
      number: 123,
      issuedOn: "2026-10-01",
      authorizationCode: "71234567890123",
      authorizationCodeDueOn: "2026-10-11",
    });
  });

  it("prints a net amount equal to the total and no VAT", () => {
    const block = facturaCFiscalBlock(authorized(5900));
    expect(block).toMatchObject({ netAmount: 5900, vatAmount: 0, total: 5900 });
  });

  it("encodes the voucher's data in the QR as the tax authority defines", () => {
    const { qrText } = facturaCFiscalBlock(authorized(123456));
    expect(JSON.stringify(qrPayload(qrText))).toBe(
      '{"ver":1,"fecha":"2026-10-01","cuit":20000000001,"ptoVta":1,"tipoCmp":11,"nroCmp":123,"importe":1234.56,"moneda":"PES","ctz":1,"tipoDocRec":99,"nroDocRec":0,"tipoCodAut":"E","codAut":71234567890123}',
    );
  });

  it("encodes a whole total as an integer amount", () => {
    const { qrText } = facturaCFiscalBlock(authorized(590000));
    expect(qrPayload(qrText)).toMatchObject({ importe: 5900 });
  });

  it("pads the Base64 payload as the tax authority's example does", () => {
    const { qrText } = facturaCFiscalBlock(authorized(5900));
    expect(qrText.slice(TAX_AUTHORITY_QR_URL.length)).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(qrText.length % 4).toBe(TAX_AUTHORITY_QR_URL.length % 4);
  });
});
