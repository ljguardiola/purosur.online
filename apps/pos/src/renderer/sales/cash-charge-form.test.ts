import { expect, test } from "vitest";
import { cashChargeRequestFrom, chargeSaleInCashRequestSchema } from "./cash-charge-form";

test("a typed amount is requested in cents", () => {
  const request = cashChargeRequestFrom({ tendered: "5.000,50", discount: "" });

  expect(request).toEqual({ tendered: 500_050 });
  expect(chargeSaleInCashRequestSchema.safeParse(request).success).toBe(true);
});

test.each(["", "abc", "5.000,001"])(
  "a typed amount of '%s' is rejected by the request's shape",
  (tendered) => {
    expect(
      chargeSaleInCashRequestSchema.safeParse(cashChargeRequestFrom({ tendered, discount: "" }))
        .success,
    ).toBe(false);
  },
);

test("a typed discount is requested as a fixed amount in cents", () => {
  const request = cashChargeRequestFrom({ tendered: "10.000", discount: "100,50" });

  expect(request).toEqual({ tendered: 1_000_000, discount: { kind: "AMOUNT", value: 10_050 } });
  expect(chargeSaleInCashRequestSchema.safeParse(request).success).toBe(true);
});

test.each(["0", "abc", "-5"])(
  "a typed discount of '%s' is rejected by the request's shape",
  (discount) => {
    expect(
      chargeSaleInCashRequestSchema.safeParse(
        cashChargeRequestFrom({ tendered: "10.000", discount }),
      ).success,
    ).toBe(false);
  },
);
