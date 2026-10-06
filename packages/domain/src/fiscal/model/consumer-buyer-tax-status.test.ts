import { describe, expect, it } from "vitest";
import type { BuyerTaxStatusOption } from "./buyer-tax-status-set.js";
import { selectConsumerBuyerTaxStatus } from "./consumer-buyer-tax-status.js";

const CONSUMIDOR_FINAL: BuyerTaxStatusOption = {
  code: 5,
  description: "Consumidor Final",
  invoiceClass: "A/M/C",
};
const OTHER: BuyerTaxStatusOption = {
  code: 91,
  description: "Condicion de prueba",
  invoiceClass: "C",
};

describe("selectConsumerBuyerTaxStatus", () => {
  it("selects the entry identified as 5", () => {
    expect(selectConsumerBuyerTaxStatus([OTHER, CONSUMIDOR_FINAL])).toBe(CONSUMIDOR_FINAL);
  });

  it("selects the entry identified as 5 whatever its description says", () => {
    for (const description of ["", "consumidor final", "Condicion de prueba"]) {
      const entry = { ...CONSUMIDOR_FINAL, description };
      expect(selectConsumerBuyerTaxStatus([OTHER, entry])).toBe(entry);
    }
  });

  it("never selects an entry by its Consumidor Final description", () => {
    for (const code of [4, 6, 50, 90]) {
      expect(selectConsumerBuyerTaxStatus([{ ...CONSUMIDOR_FINAL, code }])).toBeUndefined();
    }
  });

  it("selects nothing when the set has no entry identified as 5", () => {
    expect(selectConsumerBuyerTaxStatus([OTHER])).toBeUndefined();
    expect(selectConsumerBuyerTaxStatus([])).toBeUndefined();
  });

  it("selects the entry only when its invoice classes admit C", () => {
    for (const invoiceClass of ["C", "A/C", "C/M", "A/M/C"]) {
      const entry = { ...CONSUMIDOR_FINAL, invoiceClass };
      expect(selectConsumerBuyerTaxStatus([entry])).toBe(entry);
    }
    for (const invoiceClass of ["A", "A/M", "", "AC", "CC", "c"]) {
      expect(selectConsumerBuyerTaxStatus([{ ...CONSUMIDOR_FINAL, invoiceClass }])).toBeUndefined();
    }
  });
});
