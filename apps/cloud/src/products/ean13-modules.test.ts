import { ean13Modules as sharedEan13Modules } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { ean13Modules } from "./ean13-modules.js";

describe("ean13Modules", () => {
  it("encodes the same 95-module bar pattern the shared contract does", () => {
    for (const code of ["2000000000015", "7791234567898", "2912345678906", "0000000000006"]) {
      expect(ean13Modules(code)).toBe(sharedEan13Modules(code));
    }
  });
});
