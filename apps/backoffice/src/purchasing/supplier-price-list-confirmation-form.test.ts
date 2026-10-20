import { CalendarDate } from "@internationalized/date";
import { supplierPriceListConfirmationBodySchema } from "@purosur/contracts";
import { describe, expect, test } from "vitest";
import {
  CONFIRMATION_FIELD_MESSAGES,
  CONFIRMATION_FIELDS,
  confirmationFormValuesOf,
  confirmationRequestFrom,
} from "./supplier-price-list-confirmation-form";

describe("confirmationRequestFrom", () => {
  test("sends the chosen date as a calendar day with the loaded version", () => {
    const request = confirmationRequestFrom({ date: new CalendarDate(2026, 9, 5), version: 3 });

    expect(request).toEqual({ listDate: "2026-09-05", version: 3 });
    expect(supplierPriceListConfirmationBodySchema.safeParse(request).success).toBe(true);
  });

  test("sends no date when none was chosen", () => {
    expect(confirmationRequestFrom({ date: null, version: 3 })).toEqual({
      listDate: null,
      version: 3,
    });
  });
});

describe("confirmationFormValuesOf", () => {
  test("starts with the date the list was read with, or none", () => {
    expect(confirmationFormValuesOf("2026-09-25", 3)).toEqual({
      date: new CalendarDate(2026, 9, 25),
      version: 3,
    });
    expect(confirmationFormValuesOf(null, 3)).toEqual({ date: null, version: 3 });
  });
});

test("lands the date on its field, and not the version", () => {
  expect(CONFIRMATION_FIELDS).toEqual({ listDate: "date", version: null });
  expect(CONFIRMATION_FIELD_MESSAGES.date({ date: null, version: 1 })).toBe(
    "Ingresá la fecha de la lista.",
  );
});
