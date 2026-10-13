import { expect, test } from "vitest";
import {
  chargeSaleByTransferRequestSchema,
  chargeSaleOnStandaloneTerminalRequestSchema,
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

test.each([
  ["a transfer", chargeSaleByTransferRequestSchema],
  ["the standalone terminal", chargeSaleOnStandaloneTerminalRequestSchema],
])("a typed amount charged on %s is accepted and a wrong one refused", (_method, schema) => {
  expect(schema.safeParse(handChargeRequestFrom({ amount: "2.000,50" })).success).toBe(true);
  expect(schema.safeParse(handChargeRequestFrom({ amount: "abc" })).success).toBe(false);
});
