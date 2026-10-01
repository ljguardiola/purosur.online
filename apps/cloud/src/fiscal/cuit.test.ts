import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { parseCuit } from "./cuit.js";

describe("parseCuit", () => {
  it("accepts a CUIT already in the hyphenated NN-NNNNNNNN-N shape", () => {
    expect(parseCuit(FICTIONAL_CUIT)).toBe(FICTIONAL_CUIT);
  });

  it("accepts a CUIT with no hyphens at all, normalizing it to NN-NNNNNNNN-N", () => {
    expect(parseCuit("20000000001")).toBe(FICTIONAL_CUIT);
  });

  it("accepts a valid check digit of 0", () => {
    expect(parseCuit(ANOTHER_FICTIONAL_CUIT)).toBe(ANOTHER_FICTIONAL_CUIT);
  });

  it("trims surrounding whitespace", () => {
    expect(parseCuit(`  ${FICTIONAL_CUIT}  `)).toBe(FICTIONAL_CUIT);
  });

  it("rejects a CUIT whose check digit does not match the first ten digits", () => {
    expect(parseCuit("20-00000000-2")).toBeUndefined();
  });

  it("rejects the rare prefix for which no check digit is ever valid", () => {
    // 2000026758 sums (with AFIP's own weights) to a remainder that yields a raw verifier of 10,
    // which AFIP never issues as a check digit: no last digit makes this CUIT valid.
    expect(parseCuit("20-00026758-0")).toBeUndefined();
    expect(parseCuit("20-00026758-1")).toBeUndefined();
  });

  it("rejects a value with the wrong number of digits", () => {
    expect(parseCuit("20-1234567-6")).toBeUndefined();
    expect(parseCuit("20-123456789-6")).toBeUndefined();
  });

  it("rejects a value containing non-digit characters", () => {
    expect(parseCuit("20-1234567X-6")).toBeUndefined();
  });

  it("rejects an empty string", () => {
    expect(parseCuit("")).toBeUndefined();
  });
});
