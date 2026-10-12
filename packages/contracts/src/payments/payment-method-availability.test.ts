import { describe, expect, it } from "vitest";
import { paymentMethodAvailabilitySchema } from "./payment-method-availability.js";

describe("paymentMethodAvailabilitySchema", () => {
  it.each([
    { qr: "available", point: "available" },
    { qr: "offline", point: "offline" },
    { qr: "available", point: "below_minimum" },
    { qr: "available", point: "not_configured" },
  ])("accepts %j", (availability) => {
    expect(paymentMethodAvailabilitySchema.parse(availability)).toEqual(availability);
  });

  it.each(["below_minimum", "not_configured", "unknown"])(
    "refuses %s as the availability of the QR",
    (qr) => {
      expect(paymentMethodAvailabilitySchema.safeParse({ qr, point: "available" }).success).toBe(
        false,
      );
    },
  );

  it("refuses an availability of the terminal that is not one the cloud or the register answers", () => {
    expect(
      paymentMethodAvailabilitySchema.safeParse({ qr: "available", point: "unknown" }).success,
    ).toBe(false);
  });

  it.each(["qr", "point"])("refuses an answer without the availability of %s", (method) => {
    const answer: Record<string, unknown> = { qr: "available", point: "available" };
    delete answer[method];

    expect(paymentMethodAvailabilitySchema.safeParse(answer).success).toBe(false);
  });
});
