import { describe, expect, it } from "vitest";
import {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  isIssuerIdentificationGrossIncomeRegistrationTooLong,
  isIssuerIdentificationLegalNameTooLong,
} from "./issuer-identification.js";

describe("ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH", () => {
  it("allows legal names of up to 200 characters", () => {
    expect(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH).toBe(200);
  });
});

describe("ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH", () => {
  it("allows Ingresos Brutos registrations of up to 100 characters", () => {
    expect(ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH).toBe(100);
  });
});

describe("isIssuerIdentificationLegalNameTooLong", () => {
  it("accepts a legal name of exactly 200 characters", () => {
    expect(
      isIssuerIdentificationLegalNameTooLong(
        "a".repeat(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH),
      ),
    ).toBe(false);
  });

  it("rejects a legal name of 201 characters", () => {
    expect(
      isIssuerIdentificationLegalNameTooLong(
        "a".repeat(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH + 1),
      ),
    ).toBe(true);
  });

  it("counts each emoji as one character toward the 200-character limit", () => {
    expect(
      isIssuerIdentificationLegalNameTooLong(
        "🔑".repeat(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH),
      ),
    ).toBe(false);
    expect(
      isIssuerIdentificationLegalNameTooLong(
        "🔑".repeat(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH + 1),
      ),
    ).toBe(true);
  });
});

describe("isIssuerIdentificationGrossIncomeRegistrationTooLong", () => {
  it("accepts a gross income registration of exactly 100 characters", () => {
    expect(
      isIssuerIdentificationGrossIncomeRegistrationTooLong(
        "a".repeat(ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH),
      ),
    ).toBe(false);
  });

  it("rejects a gross income registration of 101 characters", () => {
    expect(
      isIssuerIdentificationGrossIncomeRegistrationTooLong(
        "a".repeat(ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH + 1),
      ),
    ).toBe(true);
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(
      isIssuerIdentificationGrossIncomeRegistrationTooLong(
        "🔑".repeat(ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH),
      ),
    ).toBe(false);
    expect(
      isIssuerIdentificationGrossIncomeRegistrationTooLong(
        "🔑".repeat(ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH + 1),
      ),
    ).toBe(true);
  });
});
