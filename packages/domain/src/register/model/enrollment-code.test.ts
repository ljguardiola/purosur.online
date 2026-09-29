import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ENROLLMENT_CODE_LENGTH,
  ENROLLMENT_CODE_MAX_FAILED_ATTEMPTS,
  ENROLLMENT_CODE_VALIDITY_MS,
  enrollmentCodeExpiresAt,
  enrollmentCodeLookup,
  isEnrollmentCodeUsable,
  isWellFormedEnrollmentCode,
  normalizeEnrollmentCode,
} from "./enrollment-code.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const wellFormedCode = fc.string({
  unit: fc.constantFrom(...BASE32_ALPHABET),
  minLength: 16,
  maxLength: 16,
});

const ISSUED_AT = new Date("2026-09-29T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-09-29T12:15:00.000Z");
const USABLE_CODE = { expiresAt: EXPIRES_AT, redeemedAt: null, failedAttempts: 0 };

describe("enrollment code limits", () => {
  it("has 16 characters, lasts 15 minutes and burns after 5 failed attempts", () => {
    expect(ENROLLMENT_CODE_LENGTH).toBe(16);
    expect(ENROLLMENT_CODE_VALIDITY_MS).toBe(15 * 60 * 1000);
    expect(ENROLLMENT_CODE_MAX_FAILED_ATTEMPTS).toBe(5);
  });
});

describe("enrollmentCodeExpiresAt", () => {
  it("expires 15 minutes after it is issued", () => {
    expect(enrollmentCodeExpiresAt(ISSUED_AT)).toEqual(EXPIRES_AT);
  });
});

describe("normalizeEnrollmentCode", () => {
  it("drops the spaces between the groups of four", () => {
    expect(normalizeEnrollmentCode("P4NX 7KWE 2QRT 6MZD")).toBe("P4NX7KWE2QRT6MZD");
  });

  it("drops every kind of whitespace anywhere in the code", () => {
    expect(normalizeEnrollmentCode("\tp4nx7kwe\n2qrt 6mzd  ")).toBe("P4NX7KWE2QRT6MZD");
  });

  it("reads lowercase letters as uppercase", () => {
    expect(normalizeEnrollmentCode("p4nx7kwe2qrt6mzd")).toBe("P4NX7KWE2QRT6MZD");
  });

  it("gives back the same code however it was typed", () => {
    fc.assert(
      fc.property(wellFormedCode, (code) => {
        const grouped = code.match(/.{4}/g)?.join(" ") ?? "";

        expect(normalizeEnrollmentCode(grouped.toLowerCase())).toBe(code);
      }),
    );
  });
});

describe("isWellFormedEnrollmentCode", () => {
  it("accepts every code of 16 base32 characters", () => {
    fc.assert(fc.property(wellFormedCode, (code) => isWellFormedEnrollmentCode(code)));
  });

  it.each([
    ["one character short", "P4NX7KWE2QRT6MZ"],
    ["one character long", "P4NX7KWE2QRT6MZDA"],
    ["empty", ""],
    ["a digit outside base32", "P4NX7KWE2QRT6MZ1"],
    ["a lowercase letter", "p4NX7KWE2QRT6MZD"],
    ["a space", "P4NX 7KWE2QRT6MZ"],
    ["a trailing line break", "P4NX7KWE2QRT6MZD\n"],
  ])("rejects a code with %s", (_case, code) => {
    expect(isWellFormedEnrollmentCode(code)).toBe(false);
  });
});

describe("enrollmentCodeLookup", () => {
  it("is the code's first group of four", () => {
    expect(enrollmentCodeLookup("P4NX7KWE2QRT6MZD")).toBe("P4NX");
  });
});

describe("isEnrollmentCodeUsable", () => {
  const beforeExpiry = new Date(EXPIRES_AT.getTime() - 1);

  it("accepts an unredeemed code before it expires with fewer than 5 failed attempts", () => {
    expect(isEnrollmentCodeUsable({ ...USABLE_CODE, failedAttempts: 4 }, beforeExpiry)).toBe(true);
  });

  it("refuses a code from the moment it expires", () => {
    expect(isEnrollmentCodeUsable(USABLE_CODE, EXPIRES_AT)).toBe(false);
  });

  it("refuses a code already redeemed", () => {
    expect(isEnrollmentCodeUsable({ ...USABLE_CODE, redeemedAt: ISSUED_AT }, beforeExpiry)).toBe(
      false,
    );
  });

  it("refuses a code that failed 5 times", () => {
    expect(isEnrollmentCodeUsable({ ...USABLE_CODE, failedAttempts: 5 }, beforeExpiry)).toBe(false);
  });
});
