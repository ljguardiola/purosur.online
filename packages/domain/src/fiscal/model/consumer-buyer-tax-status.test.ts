import { describe, expect, it } from "vitest";
import type { BuyerTaxStatusOption } from "./buyer-tax-status-set.js";
import { selectConsumerBuyerTaxStatus } from "./consumer-buyer-tax-status.js";

const CONSUMIDOR_FINAL: BuyerTaxStatusOption = {
  code: 90,
  description: "Consumidor Final",
  invoiceClass: "A/M/C",
};
const OTHER: BuyerTaxStatusOption = {
  code: 91,
  description: "Condicion de prueba",
  invoiceClass: "C",
};

describe("selectConsumerBuyerTaxStatus", () => {
  it("selects the Consumidor Final entry whichever code it carries", () => {
    expect(selectConsumerBuyerTaxStatus([OTHER, CONSUMIDOR_FINAL])).toBe(CONSUMIDOR_FINAL);
    const recoded = { ...CONSUMIDOR_FINAL, code: 7 };
    expect(selectConsumerBuyerTaxStatus([OTHER, recoded])).toBe(recoded);
  });

  it("selects nothing when no entry is described as Consumidor Final", () => {
    expect(selectConsumerBuyerTaxStatus([OTHER])).toBeUndefined();
    expect(selectConsumerBuyerTaxStatus([])).toBeUndefined();
  });

  it("requires the description to match exactly", () => {
    for (const description of ["consumidor final", "Consumidor Final ", "Consumidor Finales"]) {
      expect(selectConsumerBuyerTaxStatus([{ ...CONSUMIDOR_FINAL, description }])).toBeUndefined();
    }
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

  it("skips a Consumidor Final entry that does not admit C for one that does", () => {
    const admitting = { ...CONSUMIDOR_FINAL, code: 5, invoiceClass: "C" };
    expect(
      selectConsumerBuyerTaxStatus([{ ...CONSUMIDOR_FINAL, invoiceClass: "A" }, admitting]),
    ).toBe(admitting);
  });
});
