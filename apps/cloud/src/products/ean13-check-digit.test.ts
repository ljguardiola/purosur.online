import {
  appendEan13CheckDigit as sharedAppendEan13CheckDigit,
  isInternalBarcode as sharedIsInternalBarcode,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { appendEan13CheckDigit, isInternalBarcode } from "./ean13-check-digit.js";

describe("appendEan13CheckDigit", () => {
  it("computes the check digit the same way the shared contract does", () => {
    for (const body of ["200000000001", "200000000002", "200000000003", "291234567890"]) {
      expect(appendEan13CheckDigit(body)).toBe(sharedAppendEan13CheckDigit(body));
    }
  });
});

describe("isInternalBarcode", () => {
  it("recognizes the same 20-29 EAN-13 codes the shared contract does", () => {
    for (const code of [
      "2000000000015",
      "2912345678906",
      "2000000000016",
      "7790987000010",
      "200000000001",
    ]) {
      expect(isInternalBarcode(code)).toBe(sharedIsInternalBarcode(code));
    }
  });
});
