import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import {
  AUTHORIZATION_CODE_TYPE_CAE,
  AUTHORIZATION_CODE_TYPE_CAEA,
  type AuthorizedCreditNoteC,
  type AuthorizedFacturaC,
  CURRENCY_PESOS,
  creditNoteCFiscalBlock,
  EXCHANGE_RATE_PESOS,
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
  facturaCFiscalBlock,
  type OfflineAuthorizedFacturaC,
  offlineFacturaCFiscalBlock,
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
      AUTHORIZATION_CODE_TYPE_CAEA,
      TAX_AUTHORITY_QR_URL,
    }).toStrictEqual({
      FACTURA_C_VOUCHER_TYPE: 11,
      FINAL_CONSUMER_DOCUMENT_TYPE: 99,
      FINAL_CONSUMER_DOCUMENT_NUMBER: 0,
      CURRENCY_PESOS: "PES",
      EXCHANGE_RATE_PESOS: 1,
      AUTHORIZATION_CODE_TYPE_CAE: "E",
      AUTHORIZATION_CODE_TYPE_CAEA: "A",
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
      authorizationCode: "71234567890123",
      authorizationCodeDueOn: "2026-10-11",
    });
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

function offlineAuthorized(total: number): OfflineAuthorizedFacturaC {
  const { document } = authorized(total);
  return {
    pointOfSale: 7,
    number: 101,
    issuedOn: "2026-10-15",
    document,
    offlineAuthorizationCode: "71234567890123",
    fortnight: { start: "2026-10-01", end: "2026-10-15" },
  };
}

describe("offlineFacturaCFiscalBlock", () => {
  it("carries the voucher, the issuer, the code and the fortnight it belongs to", () => {
    expect(offlineFacturaCFiscalBlock(offlineAuthorized(5900))).toMatchObject({
      invoiceClass: "C",
      voucherTypeCode: 11,
      issuer: { legalName: FICTIONAL_LEGAL_NAME, cuit: FICTIONAL_CUIT },
      buyerTaxStatusDescription: "Consumidor Final",
      pointOfSale: 7,
      number: 101,
      authorizationCode: "71234567890123",
      fortnight: { start: "2026-10-01", end: "2026-10-15" },
    });
  });

  it("encodes the code in the QR as authorized by a pre-obtained code", () => {
    const { qrText } = offlineFacturaCFiscalBlock(offlineAuthorized(123456));
    expect(JSON.stringify(qrPayload(qrText))).toBe(
      '{"ver":1,"fecha":"2026-10-15","cuit":20000000001,"ptoVta":7,"tipoCmp":11,"nroCmp":101,"importe":1234.56,"moneda":"PES","ctz":1,"tipoDocRec":99,"nroDocRec":0,"tipoCodAut":"A","codAut":71234567890123}',
    );
  });

  it("holds exactly what the document shows: no buyer identification, legend or VAT line", () => {
    expect(Object.keys(offlineFacturaCFiscalBlock(offlineAuthorized(5900))).sort()).toEqual([
      "authorizationCode",
      "buyerTaxStatusDescription",
      "fortnight",
      "invoiceClass",
      "issuer",
      "number",
      "pointOfSale",
      "qrText",
      "voucherTypeCode",
    ]);
  });
});

function authorizedCreditNote(total: number): AuthorizedCreditNoteC {
  const { document } = authorized(total);
  return {
    pointOfSale: 1,
    number: 9,
    issuedOn: "2026-10-02",
    total,
    document,
    authorizationCode: "71234567890999",
    authorizationCodeDueOn: "2026-10-12",
    corrects: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale: 1, number: 123 },
  };
}

describe("creditNoteCFiscalBlock", () => {
  it("carries the voucher, the issuer, the authorization and the voucher it corrects", () => {
    expect(creditNoteCFiscalBlock(authorizedCreditNote(5900))).toMatchObject({
      invoiceClass: "C",
      voucherTypeCode: 13,
      issuer: {
        legalName: FICTIONAL_LEGAL_NAME,
        cuit: FICTIONAL_CUIT,
        taxStatus: "Responsable Monotributo",
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2020-01-15",
      },
      buyerTaxStatusDescription: "Consumidor Final",
      pointOfSale: 1,
      number: 9,
      authorizationCode: "71234567890999",
      authorizationCodeDueOn: "2026-10-12",
      corrects: { voucherType: 11, pointOfSale: 1, number: 123 },
    });
  });

  it("encodes the credit note's own data in the QR as the tax authority defines", () => {
    const { qrText } = creditNoteCFiscalBlock(authorizedCreditNote(123456));
    expect(JSON.stringify(qrPayload(qrText))).toBe(
      '{"ver":1,"fecha":"2026-10-02","cuit":20000000001,"ptoVta":1,"tipoCmp":13,"nroCmp":9,"importe":1234.56,"moneda":"PES","ctz":1,"tipoDocRec":99,"nroDocRec":0,"tipoCodAut":"E","codAut":71234567890999}',
    );
  });

  it("encodes the total of the credit note, not that of the invoice it corrects", () => {
    const creditNote = { ...authorizedCreditNote(5900), total: 2500 };
    expect(qrPayload(creditNoteCFiscalBlock(creditNote).qrText)).toMatchObject({ importe: 25 });
  });
});
