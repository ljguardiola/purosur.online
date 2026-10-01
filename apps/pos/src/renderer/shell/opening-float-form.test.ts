import { expect, test } from "vitest";
import {
  EMPTY_OPENING_FLOAT_FORM,
  INVALID_OPENING_FLOAT_MESSAGE,
  openCashSessionRequestSchema,
  openingFloatMessage,
  openingFloatRequestFrom,
} from "./opening-float-form";

test.each([
  { typed: "20.000,50", cents: 2_000_050 },
  { typed: "0", cents: 0 },
])("a typed float of '$typed' is sent as $cents cents", ({ typed, cents }) => {
  const request = openingFloatRequestFrom({ openingFloat: typed });

  expect(request).toEqual({ opening_float: cents });
  expect(openCashSessionRequestSchema.safeParse(request).success).toBe(true);
});

test.each(["abc", "20.000,001", "21.474.836,48"])(
  "a typed float of '%s' is rejected by the request's shape",
  (typed) => {
    expect(
      openCashSessionRequestSchema.safeParse(openingFloatRequestFrom({ openingFloat: typed }))
        .success,
    ).toBe(false);
  },
);

test.each([
  { typed: "", message: "Ingresá el fondo inicial." },
  { typed: "  ", message: "Ingresá el fondo inicial." },
  { typed: "abc", message: INVALID_OPENING_FLOAT_MESSAGE },
])("a typed float of '$typed' asks: $message", ({ typed, message }) => {
  expect(openingFloatMessage({ ...EMPTY_OPENING_FLOAT_FORM, openingFloat: typed })).toBe(message);
});
