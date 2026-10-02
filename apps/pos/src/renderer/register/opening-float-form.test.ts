import { expect, test } from "vitest";
import {
  EMPTY_OPENING_FLOAT_FORM,
  INVALID_OPENING_FLOAT_MESSAGE,
  openCashSessionRequestSchema,
  openingFloatMessage,
  openingFloatRequestFrom,
} from "./opening-float-form";

test("a typed float is sent as cents", () => {
  const request = openingFloatRequestFrom({ openingFloat: "20.000,50" });

  expect(request).toEqual({ opening_float: 2_000_050 });
  expect(openCashSessionRequestSchema.safeParse(request).success).toBe(true);
});

test("a typed float that is not an amount is rejected by the request's shape", () => {
  expect(
    openCashSessionRequestSchema.safeParse(openingFloatRequestFrom({ openingFloat: "abc" }))
      .success,
  ).toBe(false);
});

test.each([
  { typed: "", message: "Ingresá el fondo inicial." },
  { typed: "  ", message: "Ingresá el fondo inicial." },
  { typed: "abc", message: INVALID_OPENING_FLOAT_MESSAGE },
])("a typed float of '$typed' asks: $message", ({ typed, message }) => {
  expect(openingFloatMessage({ ...EMPTY_OPENING_FLOAT_FORM, openingFloat: typed })).toBe(message);
});
