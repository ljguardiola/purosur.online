import { describe, expect, it } from "vitest";
import { parseEsArNumber } from "./esArNumber";

describe("parseEsArNumber", () => {
  it("splits a comma-separated number into its whole and fraction digits", () => {
    expect(parseEsArNumber("7500,5", 2)).toEqual({ whole: "7500", fraction: "5" });
    expect(parseEsArNumber("7500", 2)).toEqual({ whole: "7500", fraction: "" });
  });

  it("drops the dots of valid 3-digit thousands groups", () => {
    expect(parseEsArNumber("1.000", 2)).toEqual({ whole: "1000", fraction: "" });
    expect(parseEsArNumber("12.345,67", 2)).toEqual({ whole: "12345", fraction: "67" });
    expect(parseEsArNumber("1.000.000", 2)).toEqual({ whole: "1000000", fraction: "" });
  });

  it("rejects a dot that is not a valid thousands group", () => {
    for (const value of ["1.5", "1.00", "1.0000", "1..000", ".5", "1.000.00", "1000.000"]) {
      expect(parseEsArNumber(value, 2), value).toBeUndefined();
    }
  });

  it("rejects a first thousands group that starts with a zero", () => {
    for (const value of ["0.500", "00.500", "000.001", "0.000,50", "01.000"]) {
      expect(parseEsArNumber(value, 2), value).toBeUndefined();
    }
  });

  it("reads leading zeros without a thousands dot as the plain number they spell", () => {
    expect(parseEsArNumber("007", 2)).toEqual({ whole: "007", fraction: "" });
    expect(parseEsArNumber("0,50", 2)).toEqual({ whole: "0", fraction: "50" });
  });

  it("allows at most the given number of decimals", () => {
    expect(parseEsArNumber("1,25", 2)).toEqual({ whole: "1", fraction: "25" });
    expect(parseEsArNumber("1,255", 2)).toBeUndefined();
    expect(parseEsArNumber("1,255", 3)).toEqual({ whole: "1", fraction: "255" });
    expect(parseEsArNumber("1,2555", 3)).toBeUndefined();
  });

  it("reads whole numbers only when no decimals are allowed", () => {
    expect(parseEsArNumber("1.250", 0)).toEqual({ whole: "1250", fraction: "" });
    expect(parseEsArNumber("1,5", 0)).toBeUndefined();
  });

  it("rejects a comma with no digits on either side of it", () => {
    expect(parseEsArNumber("1,", 2)).toBeUndefined();
    expect(parseEsArNumber(",5", 2)).toBeUndefined();
  });

  it("rejects signs, letters, inner spaces and a second comma", () => {
    for (const value of ["-1", "+1", "abc", "1,2,3", "1 000", ""]) {
      expect(parseEsArNumber(value, 2), value).toBeUndefined();
    }
  });

  it("trims surrounding spaces", () => {
    expect(parseEsArNumber("  1.000,5  ", 2)).toEqual({ whole: "1000", fraction: "5" });
  });
});
