import { describe, expect, it } from "vitest";
import { handConfirmedPaymentMethodSchema } from "./hand-confirmed-payment-method.js";

describe("handConfirmedPaymentMethodSchema", () => {
  it.each(["TRANSFER", "STANDALONE_TERMINAL"])("accepts %s", (method) => {
    expect(handConfirmedPaymentMethodSchema.parse(method)).toBe(method);
  });

  it("refuses a method no person confirms by hand", () => {
    expect(handConfirmedPaymentMethodSchema.safeParse("QR").success).toBe(false);
  });
});
