import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import type { BuyerTaxStatusOption } from "./buyer-tax-status-set.js";
import {
  type IssuerIdentificationInEffect,
  type PreEmissionGateInput,
  preEmissionGate,
} from "./pre-emission-gate.js";

const ISSUER: IssuerIdentificationInEffect = {
  legalName: FICTIONAL_LEGAL_NAME,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
  authorizedCuit: FICTIONAL_CUIT,
  taxStatus: "Condicion de prueba",
  version: 3,
};
const CONSUMIDOR_FINAL: BuyerTaxStatusOption = {
  code: 90,
  description: "Consumidor Final",
  invoiceClass: "A/M/C",
};
const INPUT: PreEmissionGateInput = {
  total: 5900,
  issuer: ISSUER,
  buyerTaxStatuses: [
    { code: 91, description: "Condicion de prueba", invoiceClass: "C" },
    CONSUMIDOR_FINAL,
  ],
};

describe("preEmissionGate", () => {
  it("composes a factura C whose net amount is the total, with no VAT", () => {
    expect(preEmissionGate(INPUT)).toStrictEqual({
      kind: "passed",
      document: {
        invoiceClass: "C",
        total: 5900,
        netAmount: 5900,
        vatAmount: 0,
        issuer: {
          legalName: FICTIONAL_LEGAL_NAME,
          cuit: FICTIONAL_CUIT,
          taxStatus: "Condicion de prueba",
          grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
          activityStartDate: "2020-01-15",
          version: 3,
        },
        buyerTaxStatusCode: 90,
      },
    });
  });

  it("takes the buyer tax-status code from the set, never from a fixed value", () => {
    const outcome = preEmissionGate({
      ...INPUT,
      buyerTaxStatuses: [{ ...CONSUMIDOR_FINAL, code: 12 }],
    });
    expect(outcome).toMatchObject({ kind: "passed", document: { buyerTaxStatusCode: 12 } });
  });

  it("fails when no issuer identification has been delivered", () => {
    expect(preEmissionGate({ ...INPUT, issuer: undefined })).toStrictEqual({
      kind: "failed",
      reason: "issuer_identification_missing",
    });
  });

  it.each([
    ["legalName", "legal_name_missing"],
    ["grossIncomeRegistration", "gross_income_registration_missing"],
    ["activityStartDate", "activity_start_date_missing"],
  ] as const)("fails when the issuer's %s is missing", (field, reason) => {
    expect(preEmissionGate({ ...INPUT, issuer: { ...ISSUER, [field]: null } })).toStrictEqual({
      kind: "failed",
      reason,
    });
  });

  it.each(["legalName", "grossIncomeRegistration", "activityStartDate"] as const)(
    "fails when the issuer's %s is blank",
    (field) => {
      expect(preEmissionGate({ ...INPUT, issuer: { ...ISSUER, [field]: "  " } })).toMatchObject({
        kind: "failed",
      });
    },
  );

  it("reports the first missing field in the order the issuer prints them", () => {
    const issuer = {
      ...ISSUER,
      legalName: null,
      grossIncomeRegistration: null,
      activityStartDate: null,
    };
    expect(preEmissionGate({ ...INPUT, issuer, buyerTaxStatuses: undefined })).toStrictEqual({
      kind: "failed",
      reason: "legal_name_missing",
    });
    expect(
      preEmissionGate({ ...INPUT, issuer: { ...issuer, legalName: FICTIONAL_LEGAL_NAME } }),
    ).toStrictEqual({ kind: "failed", reason: "gross_income_registration_missing" });
  });

  it("fails when no buyer tax-status set has been delivered", () => {
    expect(preEmissionGate({ ...INPUT, buyerTaxStatuses: undefined })).toStrictEqual({
      kind: "failed",
      reason: "buyer_tax_status_missing",
    });
  });

  it("fails when the set has no Consumidor Final entry admitting C", () => {
    expect(
      preEmissionGate({
        ...INPUT,
        buyerTaxStatuses: [{ ...CONSUMIDOR_FINAL, invoiceClass: "A/M" }],
      }),
    ).toStrictEqual({ kind: "failed", reason: "buyer_tax_status_missing" });
  });
});
