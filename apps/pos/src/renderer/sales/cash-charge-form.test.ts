import { chargeSaleInCashRequestSchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import { cashChargeRequestFrom } from "./cash-charge-form";

test("a typed amount is requested in cents", () => {
  const request = cashChargeRequestFrom({ tendered: "5.000,50" });

  expect(request).toEqual({ tendered: 500_050 });
  expect(chargeSaleInCashRequestSchema.safeParse(request).success).toBe(true);
});

test.each(["", "abc", "5.000,001"])(
  "a typed amount of '%s' is rejected by the request's shape",
  (tendered) => {
    expect(
      chargeSaleInCashRequestSchema.safeParse(cashChargeRequestFrom({ tendered })).success,
    ).toBe(false);
  },
);
