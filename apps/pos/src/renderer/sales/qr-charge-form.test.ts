import { expect, test } from "vitest";
import { qrChargeRequestFrom, startQrChargeRequestSchema } from "./qr-charge-form";

test("a typed amount is requested in cents", () => {
  const request = qrChargeRequestFrom({ amount: "2.000,50" });

  expect(request).toEqual({ amount: 200_050 });
  expect(startQrChargeRequestSchema.safeParse(request).success).toBe(true);
});

test.each(["", "abc", "5.000,001"])(
  "a typed amount of '%s' is rejected by the request's shape",
  (amount) => {
    expect(startQrChargeRequestSchema.safeParse(qrChargeRequestFrom({ amount })).success).toBe(
      false,
    );
  },
);
