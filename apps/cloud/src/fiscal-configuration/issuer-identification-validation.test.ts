import {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  type IssuerIdentificationFieldValidationFailure,
  readIssuerIdentificationEditBody,
} from "./issuer-identification-validation.js";

const TODAY = new Date("2026-09-25T12:00:00.000Z");

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    legal_name: "Puro Sur SRL",
    gross_income_registration: "CM 901-123456-3",
    activity_start_date: "2020-01-15",
    version: 1,
    ...overrides,
  };
}

function isValidationFailure(
  value: ReturnType<typeof readIssuerIdentificationEditBody>,
): value is IssuerIdentificationFieldValidationFailure {
  return "field" in value;
}

describe("readIssuerIdentificationEditBody", () => {
  it("accepts a fully valid body", () => {
    const result = readIssuerIdentificationEditBody(validBody(), TODAY);

    expect(isValidationFailure(result)).toBe(false);
    if (!isValidationFailure(result)) {
      expect(result).toEqual({
        legalName: "Puro Sur SRL",
        grossIncomeRegistration: "CM 901-123456-3",
        activityStartDate: "2020-01-15",
        version: 1,
      });
    }
  });

  it("trims surrounding whitespace from the text fields", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ legal_name: "  Puro Sur SRL  ", gross_income_registration: "  CM 901  " }),
      TODAY,
    );

    expect(isValidationFailure(result)).toBe(false);
    if (!isValidationFailure(result)) {
      expect(result.legalName).toBe("Puro Sur SRL");
      expect(result.grossIncomeRegistration).toBe("CM 901");
    }
  });

  it("rejects a missing legal_name", () => {
    const body = validBody();
    delete body.legal_name;

    const result = readIssuerIdentificationEditBody(body, TODAY);

    expect(result).toMatchObject({ field: "legal_name" });
  });

  it("rejects an empty legal_name (blank after trimming)", () => {
    const result = readIssuerIdentificationEditBody(validBody({ legal_name: "   " }), TODAY);

    expect(result).toMatchObject({ field: "legal_name" });
  });

  it(`rejects a legal_name longer than ${ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH} characters`, () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ legal_name: "a".repeat(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH + 1) }),
      TODAY,
    );

    expect(result).toMatchObject({ field: "legal_name" });
  });

  it(`accepts a legal_name of exactly ${ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH} characters`, () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ legal_name: "a".repeat(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH) }),
      TODAY,
    );

    expect(isValidationFailure(result)).toBe(false);
  });

  it("rejects an empty gross_income_registration", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ gross_income_registration: "" }),
      TODAY,
    );

    expect(result).toMatchObject({ field: "gross_income_registration" });
  });

  it(`rejects a gross_income_registration longer than ${ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH} characters`, () => {
    const result = readIssuerIdentificationEditBody(
      validBody({
        gross_income_registration: "a".repeat(
          ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH + 1,
        ),
      }),
      TODAY,
    );

    expect(result).toMatchObject({ field: "gross_income_registration" });
  });

  it("rejects an activity_start_date that is not a string", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ activity_start_date: 20200115 }),
      TODAY,
    );

    expect(result).toMatchObject({ field: "activity_start_date" });
  });

  it("rejects an activity_start_date that is not zero-padded ISO YYYY-MM-DD", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ activity_start_date: "2020-1-15" }),
      TODAY,
    );

    expect(result).toMatchObject({ field: "activity_start_date" });
  });

  it("rejects a calendar date that does not exist, such as February 30th", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ activity_start_date: "2020-02-30" }),
      TODAY,
    );

    expect(result).toMatchObject({ field: "activity_start_date" });
  });

  it("accepts an activity_start_date of exactly today", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ activity_start_date: "2026-09-25" }),
      TODAY,
    );

    expect(isValidationFailure(result)).toBe(false);
  });

  it("rejects an activity_start_date one day in the future", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ activity_start_date: "2026-09-26" }),
      TODAY,
    );

    expect(result).toMatchObject({ field: "activity_start_date" });
  });

  describe("at 23:30 in Argentina, when the UTC calendar has already moved to the next day", () => {
    const lateEveningInArgentina = new Date("2026-09-25T23:30:00-03:00");

    it("rejects Argentina's tomorrow", () => {
      const result = readIssuerIdentificationEditBody(
        validBody({ activity_start_date: "2026-09-26" }),
        lateEveningInArgentina,
      );

      expect(result).toMatchObject({ field: "activity_start_date" });
    });

    it("accepts Argentina's today", () => {
      const result = readIssuerIdentificationEditBody(
        validBody({ activity_start_date: "2026-09-25" }),
        lateEveningInArgentina,
      );

      expect(isValidationFailure(result)).toBe(false);
    });
  });

  it("rejects a missing version", () => {
    const body = validBody();
    delete body.version;

    const result = readIssuerIdentificationEditBody(body, TODAY);

    expect(result).toMatchObject({ field: "version" });
  });

  it("rejects a non-integer version", () => {
    const result = readIssuerIdentificationEditBody(validBody({ version: 1.5 }), TODAY);

    expect(result).toMatchObject({ field: "version" });
  });

  it("rejects a version below 1", () => {
    const result = readIssuerIdentificationEditBody(validBody({ version: 0 }), TODAY);

    expect(result).toMatchObject({ field: "version" });
  });

  it("ignores an authorized_cuit sent by the client: it is never read from the body", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ authorized_cuit: "20-99999999-9" }),
      TODAY,
    );

    expect(isValidationFailure(result)).toBe(false);
    if (!isValidationFailure(result)) {
      expect(result).not.toHaveProperty("authorizedCuit");
    }
  });

  it("ignores a tax_status sent by the client: it is never read from the body", () => {
    const result = readIssuerIdentificationEditBody(
      validBody({ tax_status: "Responsable Inscripto" }),
      TODAY,
    );

    expect(isValidationFailure(result)).toBe(false);
    if (!isValidationFailure(result)) {
      expect(result).not.toHaveProperty("taxStatus");
    }
  });
});
