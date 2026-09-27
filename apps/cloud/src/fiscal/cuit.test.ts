import { describe, expect, it } from "vitest";
import { parseCuit } from "./cuit.js";

describe("parseCuit", () => {
  it("accepts a CUIT already in the hyphenated NN-NNNNNNNN-N shape", () => {
    expect(parseCuit("20-12345678-6")).toBe("20-12345678-6");
  });

  it("accepts a CUIT with no hyphens at all, normalizing it to NN-NNNNNNNN-N", () => {
    expect(parseCuit("20123456786")).toBe("20-12345678-6");
  });

  it("accepts another valid check digit (0), not just 6", () => {
    expect(parseCuit("27-12345678-0")).toBe("27-12345678-0");
  });

  it("trims surrounding whitespace", () => {
    expect(parseCuit("  20-12345678-6  ")).toBe("20-12345678-6");
  });

  it("rejects a CUIT whose check digit does not match the first ten digits", () => {
    expect(parseCuit("20-12345678-5")).toBeUndefined();
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
