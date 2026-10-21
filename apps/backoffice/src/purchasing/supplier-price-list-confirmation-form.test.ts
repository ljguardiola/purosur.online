import { CalendarDate } from "@internationalized/date";
import { supplierPriceListConfirmationBodySchema } from "@purosur/contracts";
import { describe, expect, test } from "vitest";
import {
  CONFIRMATION_FIELD_MESSAGES,
  CONFIRMATION_FIELDS,
  confirmationFormValuesOf,
  confirmationRequestFrom,
  PRICES_INCLUDE_VAT_OPTIONS,
} from "./supplier-price-list-confirmation-form";

describe("confirmationRequestFrom", () => {
  test("sends the chosen date as a calendar day with the loaded version", () => {
    const request = confirmationRequestFrom({
      date: new CalendarDate(2026, 9, 5),
      pricesIncludeVat: "included",
      version: 3,
    });

    expect(request).toEqual({ listDate: "2026-09-05", pricesIncludeVat: true, version: 3 });
    expect(supplierPriceListConfirmationBodySchema.safeParse(request).success).toBe(true);
  });

  test("sends no date when none was chosen", () => {
    expect(
      confirmationRequestFrom({ date: null, pricesIncludeVat: "included", version: 3 }),
    ).toEqual({
      listDate: null,
      pricesIncludeVat: true,
      version: 3,
    });
  });

  test.each([
    ["included", true],
    ["excluded", false],
    [null, null],
  ] as const)("sends the VAT choice %s as %s", (pricesIncludeVat, sent) => {
    const request = confirmationRequestFrom({ date: null, pricesIncludeVat, version: 3 });

    expect(request.pricesIncludeVat).toBe(sent);
    expect(supplierPriceListConfirmationBodySchema.safeParse(request).success).toBe(true);
  });
});

describe("confirmationFormValuesOf", () => {
  test("starts with the date the list was read with, or none", () => {
    expect(confirmationFormValuesOf("2026-09-25", true, 3)).toEqual({
      date: new CalendarDate(2026, 9, 25),
      pricesIncludeVat: "included",
      version: 3,
    });
    expect(confirmationFormValuesOf(null, true, 3)).toEqual({
      date: null,
      pricesIncludeVat: "included",
      version: 3,
    });
  });

  test("starts with the VAT answer the list was read with, or none", () => {
    expect(confirmationFormValuesOf(null, false, 3).pricesIncludeVat).toBe("excluded");
    expect(confirmationFormValuesOf(null, null, 3).pricesIncludeVat).toBeNull();
  });
});

test("lands the date and the VAT answer on their fields, and not the version", () => {
  expect(CONFIRMATION_FIELDS).toEqual({
    listDate: "date",
    pricesIncludeVat: "pricesIncludeVat",
    version: null,
  });
  const values = { date: null, pricesIncludeVat: null, version: 1 };
  expect(CONFIRMATION_FIELD_MESSAGES.date(values)).toBe("Ingresá la fecha de la lista.");
  expect(CONFIRMATION_FIELD_MESSAGES.pricesIncludeVat(values)).toBe(
    "Elegí si los precios incluyen IVA.",
  );
});

describe("PRICES_INCLUDE_VAT_OPTIONS", () => {
  test("offers that the prices include VAT and that they do not, read after the field's label", () => {
    expect(PRICES_INCLUDE_VAT_OPTIONS).toEqual([
      { value: "included", label: "incluyen IVA" },
      { value: "excluded", label: "no incluyen IVA" },
    ]);
  });
});
