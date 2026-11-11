import { expect, test } from "vitest";
import {
  INVALID_OPENING_FLOAT_MESSAGE,
  openCashSessionRequestSchema,
  openingFloatFormFor,
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
  expect(openingFloatMessage({ openingFloat: typed })).toBe(message);
});

test("the float starts as the cash counted at the previous close, written as it is typed", () => {
  expect(
    openingFloatFormFor({
      kind: "previous_close",
      closed_at: "2026-11-04T20:14:00.000-03:00",
      counted_cash: 14_400_050,
    }),
  ).toEqual({ openingFloat: "144.000,50" });
});

test("the float starts empty when nothing was closed before", () => {
  expect(openingFloatFormFor({ kind: "none" })).toEqual({ openingFloat: "" });
});
