import { expect, test } from "vitest";
import {
  mercadoPagoChargeRequestFrom,
  mercadoPagoChargeRequestSchema,
} from "./mercado-pago-charge-form";

test("a typed amount is requested in cents", () => {
  const request = mercadoPagoChargeRequestFrom({ amount: "2.000,50" });

  expect(request).toEqual({ amount: 200_050 });
  expect(mercadoPagoChargeRequestSchema.safeParse(request).success).toBe(true);
});

test.each(["", "abc", "5.000,001"])(
  "a typed amount of '%s' is rejected by the request's shape",
  (amount) => {
    expect(
      mercadoPagoChargeRequestSchema.safeParse(mercadoPagoChargeRequestFrom({ amount })).success,
    ).toBe(false);
  },
);
