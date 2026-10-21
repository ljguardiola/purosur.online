import { supplierPriceListRowPriceBodySchema } from "@purosur/contracts";
import { describe, expect, test } from "vitest";
import {
  EMPTY_ROW_PRICE_FORM,
  ROW_PRICE_FIELD_MESSAGES,
  ROW_PRICE_FIELDS,
  rowPriceFormValuesOf,
  rowPriceRequestFrom,
} from "./supplier-price-list-row-price-form";

describe("rowPriceRequestFrom", () => {
  test("turns the typed price into cents and keeps the list version", () => {
    expect(rowPriceRequestFrom({ price: "1.234,50", version: 3 })).toEqual({
      priceCents: 123_450,
      version: 3,
    });
  });

  test("builds a request the contract refuses when the price is not an amount", () => {
    const request = rowPriceRequestFrom({ price: "abc", version: 3 });

    expect(supplierPriceListRowPriceBodySchema.safeParse(request).success).toBe(false);
  });
});

describe("rowPriceFormValuesOf", () => {
  test("shows the row's price as typed amount, or empty when it has none", () => {
    expect(rowPriceFormValuesOf(25_450_000, 3)).toEqual({ price: "254.500,00", version: 3 });
    expect(rowPriceFormValuesOf(null, 3)).toEqual({ price: "", version: 3 });
  });
});

test("starts empty", () => {
  expect(EMPTY_ROW_PRICE_FORM).toEqual({ price: "", version: 1 });
});

test("lands the price the contract refuses on the price field, and not the version", () => {
  expect(ROW_PRICE_FIELDS).toEqual({ priceCents: "price", version: null });
  expect(ROW_PRICE_FIELD_MESSAGES.price(EMPTY_ROW_PRICE_FORM)).toBe("Ingresá el precio del ítem.");
  expect(ROW_PRICE_FIELD_MESSAGES.price({ price: "abc", version: 1 })).toBe(
    "Ingresá un precio válido, como 1.234,50.",
  );
});
