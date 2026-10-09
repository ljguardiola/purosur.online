import { describe, expect, it } from "vitest";
import { isValidCuit } from "../model/cuit.js";
import {
  ANOTHER_FICTIONAL_CUIT,
  CUIT_NUMBER_NO_CHECK_DIGIT_VALIDATES,
  FICTIONAL_CERTIFICATE_CUIT,
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "./fictional-tax-identities.js";

describe.each([FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT, FICTIONAL_CERTIFICATE_CUIT])(
  "the fictional CUIT %s",
  (cuit) => {
    it("is accepted by CUIT validation", () => {
      expect(isValidCuit(cuit)).toBe(true);
    });
  },
);

describe.each([FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT])("the fictional CUIT %s", (cuit) => {
  it("has an all-zero number, which no taxpayer is issued", () => {
    expect(cuit.split("-")[1]).toBe("00000000");
  });
});

describe("the CUIT number no check digit validates", () => {
  it("is refused by CUIT validation with every check digit", () => {
    const firstTen = CUIT_NUMBER_NO_CHECK_DIGIT_VALIDATES.slice(0, -1);

    for (let checkDigit = 0; checkDigit <= 9; checkDigit += 1) {
      expect(isValidCuit(``)).toBe(false);
    }
  });

  it("has an all-zero number, which no taxpayer is issued", () => {
    expect(CUIT_NUMBER_NO_CHECK_DIGIT_VALIDATES.split("-")[1]).toBe("00000000");
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
