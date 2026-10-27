import { describe, expect, it } from "vitest";
import { decideRowVatRate } from "./supplier-price-list-row-link-steps.js";

describe("decideRowVatRate", () => {
  it.each([false, null])(
    "keeps the rate given for a list whose prices including VAT is %j",
    (pricesIncludeVat) => {
      expect(decideRowVatRate(pricesIncludeVat, 1050)).toEqual({ kind: "decided", vatRate: 1050 });
    },
  );

  it.each([false, null])(
    "refuses no rate for a list whose prices including VAT is %j",
    (pricesIncludeVat) => {
      expect(decideRowVatRate(pricesIncludeVat, null)).toEqual({
        kind: "refused",
        refusal: "vat_rate_missing",
      });
    },
  );

  it.each([2100, null])(
    "keeps no rate for a list whose prices include VAT, given %j",
    (vatRate) => {
      expect(decideRowVatRate(true, vatRate)).toEqual({ kind: "decided", vatRate: null });
    },
  );

  it.each([
    [false, 21],
    [null, 0],
    [true, 1234],
  ])(
    "refuses a rate that is not offered for a list whose prices including VAT is %j: %s",
    (pricesIncludeVat, vatRate) => {
      expect(decideRowVatRate(pricesIncludeVat, vatRate)).toEqual({
        kind: "refused",
        refusal: "vat_rate_invalid",
      });
    },
  );
});
