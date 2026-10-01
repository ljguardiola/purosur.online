import { describe, expect, it } from "vitest";
import {
  ANOTHER_FICTIONAL_CUIT,
  FICTIONAL_CERTIFICATE_CUIT,
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "./fictional-tax-identities.js";

const CHECK_DIGIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function checkDigitOf(firstTenDigits: string): number {
  const sum = CHECK_DIGIT_WEIGHTS.reduce(
    (total, weight, index) => total + weight * Number(firstTenDigits[index]),
    0,
  );
  return (11 - (sum % 11)) % 11;
}

describe.each([FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT, FICTIONAL_CERTIFICATE_CUIT])(
  "the fictional CUIT %s",
  (cuit) => {
    const [prefix, body, checkDigit] = cuit.split("-");

    it("has the NN-NNNNNNNN-N shape with a valid check digit, so CUIT validation accepts it", () => {
      expect(cuit).toMatch(/^\d{2}-\d{8}-\d$/);
      expect(Number(checkDigit)).toBe(checkDigitOf(`${prefix}${body}`));
    });
  },
);

describe.each([FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT])("the fictional CUIT %s", (cuit) => {
  it("has an all-zero number, which no taxpayer is issued", () => {
    expect(cuit.split("-")[1]).toBe("00000000");
  });
});

describe("the CUIT the self-signed test certificate carries", () => {
  it("has the sequential placeholder number 12345678", () => {
    expect(FICTIONAL_CERTIFICATE_CUIT.split("-")[1]).toBe("12345678");
  });
});

describe("the fictional tax identities", () => {
  it("are different CUITs", () => {
    expect(new Set([FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT, FICTIONAL_CERTIFICATE_CUIT]).size).toBe(
      3,
    );
  });

  it("name a legal name that reads as a test placeholder", () => {
    expect(FICTIONAL_LEGAL_NAME).toMatch(/\bde Prueba\b/);
  });

  it("number the Ingresos Brutos registration with zeros only", () => {
    expect(FICTIONAL_GROSS_INCOME_REGISTRATION).toMatch(/^\D*0[\D0]*$/);
  });
});
