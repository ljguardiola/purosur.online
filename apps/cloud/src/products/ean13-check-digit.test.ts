import { appendEan13CheckDigit as sharedAppendEan13CheckDigit } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { appendEan13CheckDigit } from "./ean13-check-digit.js";

describe("appendEan13CheckDigit", () => {
  it("computes the check digit the same way the shared contract does", () => {
    for (const body of ["200000000001", "200000000002", "200000000003", "291234567890"]) {
      expect(appendEan13CheckDigit(body)).toBe(sharedAppendEan13CheckDigit(body));
    }
  });
});
