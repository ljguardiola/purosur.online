import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FISCAL_ADDRESS_NAME_MAX_LENGTH,
  FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH,
  isFiscalAddressNameTooLong,
  isFiscalAddressStreetAddressTooLong,
  isSameFiscalAddressName,
} from "./fiscal-address.js";

const fullUnicodeCodePoint = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

describe("FISCAL_ADDRESS_NAME_MAX_LENGTH", () => {
  it("allows names of up to 100 characters", () => {
    expect(FISCAL_ADDRESS_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH", () => {
  it("allows street addresses of up to 200 characters", () => {
    expect(FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH).toBe(200);
  });
});

describe("isFiscalAddressNameTooLong", () => {
  it("accepts a name of exactly 100 characters and rejects one of 101", () => {
    expect(isFiscalAddressNameTooLong("a".repeat(100))).toBe(false);
    expect(isFiscalAddressNameTooLong("a".repeat(101))).toBe(true);
  });

  it("counts each emoji as one character", () => {
    expect(isFiscalAddressNameTooLong("🏪".repeat(100))).toBe(false);
    expect(isFiscalAddressNameTooLong("🏪".repeat(101))).toBe(true);
  });

  it("is true exactly when the code point count exceeds the limit", () => {
    fc.assert(
      fc.property(fc.array(fullUnicodeCodePoint, { maxLength: 150 }), (codePoints) => {
        expect(isFiscalAddressNameTooLong(codePoints.join(""))).toBe(codePoints.length > 100);
      }),
    );
  });
});

describe("isFiscalAddressStreetAddressTooLong", () => {
  it("accepts a street address of exactly 200 characters and rejects one of 201", () => {
    expect(isFiscalAddressStreetAddressTooLong("a".repeat(200))).toBe(false);
    expect(isFiscalAddressStreetAddressTooLong("a".repeat(201))).toBe(true);
  });

  it("counts each emoji as one character", () => {
    expect(isFiscalAddressStreetAddressTooLong("🏪".repeat(200))).toBe(false);
    expect(isFiscalAddressStreetAddressTooLong("🏪".repeat(201))).toBe(true);
  });
});

describe("isSameFiscalAddressName", () => {
  it("treats names that differ only in letter case as the same", () => {
    expect(isSameFiscalAddressName("Depósito Central", "DEPÓSITO CENTRAL")).toBe(true);
  });

  it("treats names that differ in any other way as different", () => {
    expect(isSameFiscalAddressName("Depósito Central", "Depósito Central 2")).toBe(false);
    expect(isSameFiscalAddressName("Deposito", "Depósito")).toBe(false);
  });
});
