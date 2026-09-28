import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  isIssuerIdentificationActivityStartDate,
  isIssuerIdentificationGrossIncomeRegistrationTooLong,
  isIssuerIdentificationLegalNameTooLong,
} from "./issuer-identification.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

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

  it("is true exactly when the value's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 250 }), (codePoints) => {
        const value = codePoints.join("");
        expect(isIssuerIdentificationLegalNameTooLong(value)).toBe(
          codePoints.length > ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
        );
      }),
    );
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

  it("is true exactly when the value's code point count exceeds the limit, for any mix of code points including ones outside the Basic Multilingual Plane", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 150 }), (codePoints) => {
        const value = codePoints.join("");
        expect(isIssuerIdentificationGrossIncomeRegistrationTooLong(value)).toBe(
          codePoints.length > ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
        );
      }),
    );
  });
});

describe("isIssuerIdentificationActivityStartDate", () => {
  const today = new Date("2026-09-25T12:00:00.000Z");

  it("accepts a past calendar date and today", () => {
    expect(isIssuerIdentificationActivityStartDate("2020-01-15", today)).toBe(true);
    expect(isIssuerIdentificationActivityStartDate("2026-09-25", today)).toBe(true);
  });

  it("rejects a date one day in the future", () => {
    expect(isIssuerIdentificationActivityStartDate("2026-09-26", today)).toBe(false);
  });

  it("rejects a date that is not a zero-padded YYYY-MM-DD", () => {
    expect(isIssuerIdentificationActivityStartDate("2020-1-15", today)).toBe(false);
    expect(isIssuerIdentificationActivityStartDate("20200115", today)).toBe(false);
    expect(isIssuerIdentificationActivityStartDate("2020-01-15T00:00", today)).toBe(false);
    expect(isIssuerIdentificationActivityStartDate("", today)).toBe(false);
  });

  it("rejects anything before the four-digit year", () => {
    expect(isIssuerIdentificationActivityStartDate("12020-01-15", today)).toBe(false);
    expect(isIssuerIdentificationActivityStartDate(" 2020-01-15", today)).toBe(false);
  });

  it("rejects a calendar date that does not exist, such as February 30th", () => {
    expect(isIssuerIdentificationActivityStartDate("2020-02-30", today)).toBe(false);
    expect(isIssuerIdentificationActivityStartDate("2021-02-29", today)).toBe(false);
    expect(isIssuerIdentificationActivityStartDate("2020-13-01", today)).toBe(false);
    expect(isIssuerIdentificationActivityStartDate("2020-00-10", today)).toBe(false);
  });

  it("accepts February 29th of a leap year", () => {
    expect(isIssuerIdentificationActivityStartDate("2020-02-29", today)).toBe(true);
  });

  it("takes today from Argentina's calendar, not UTC's, late in the evening", () => {
    const lateEveningInArgentina = new Date("2026-09-25T23:30:00-03:00");

    expect(isIssuerIdentificationActivityStartDate("2026-09-26", lateEveningInArgentina)).toBe(
      false,
    );
    expect(isIssuerIdentificationActivityStartDate("2026-09-25", lateEveningInArgentina)).toBe(
      true,
    );
  });
});
