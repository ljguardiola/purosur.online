import { expect, test } from "vitest";
import {
  chargeSaleByTransferRequestSchema,
  handChargeRequestFrom,
} from "./hand-charge-form";

test("a typed amount is requested in cents", () => {
  const request = handChargeRequestFrom({ amount: "2.000,50" });

  expect(request).toEqual({ amount: 200_050 });
  expect(chargeSaleByTransferRequestSchema.safeParse(request).success).toBe(true);
});

test.each(["", "abc", "5.000,001"])(
  "a typed amount of '%s' is rejected by the request's shape",
  (amount) => {
    expect(
      chargeSaleByTransferRequestSchema.safeParse(handChargeRequestFrom({ amount })).success,
    ).toBe(false);
  },
);
