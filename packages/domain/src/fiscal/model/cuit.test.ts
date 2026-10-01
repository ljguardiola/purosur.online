import { describe, expect, it } from "vitest";
import {
  ANOTHER_FICTIONAL_CUIT,
  FICTIONAL_CUIT,
} from "../test-support/fictional-tax-identities.js";
import { isValidCuit } from "./cuit.js";

describe("isValidCuit", () => {
  it("accepts a CUIT in the NN-NNNNNNNN-N shape with a matching check digit", () => {
    expect(isValidCuit(FICTIONAL_CUIT)).toBe(true);
  });

  it("accepts a valid check digit of 0", () => {
    expect(isValidCuit(ANOTHER_FICTIONAL_CUIT)).toBe(true);
  });

  it("rejects a CUIT whose check digit does not match the first ten digits", () => {
    expect(isValidCuit("20-00000000-2")).toBe(false);
  });

  it("rejects the rare prefix for which no check digit is ever valid", () => {
    expect(isValidCuit("20-00026758-0")).toBe(false);
    expect(isValidCuit("20-00026758-1")).toBe(false);
  });

  it("rejects a value with the wrong number of digits", () => {
    expect(isValidCuit("20-1234567-6")).toBe(false);
    expect(isValidCuit("20-123456789-6")).toBe(false);
  });

  it("rejects a value that is not in the hyphenated shape", () => {
    expect(isValidCuit("20000000001")).toBe(false);
    expect(isValidCuit(`  `)).toBe(false);
  });

  it("rejects a value containing non-digit characters", () => {
    expect(isValidCuit("20-1234567X-6")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidCuit("")).toBe(false);
  });
});
