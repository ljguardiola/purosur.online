import { describe, expect, it } from "vitest";
import { paymentMethodAvailabilitySchema } from "./payment-method-availability.js";

describe("paymentMethodAvailabilitySchema", () => {
  it.each([
    { qr: "available", point: "available", point_minimum: 1500 },
    { qr: "offline", point: "offline", point_minimum: 1500 },
    { qr: "available", point: "below_minimum", point_minimum: 1500 },
    { qr: "available", point: "not_configured", point_minimum: 1500 },
    { qr: "not_configured", point: "available", point_minimum: 1500 },
  ])("accepts %j", (availability) => {
    expect(paymentMethodAvailabilitySchema.parse(availability)).toEqual(availability);
  });

  it.each(["below_minimum", "unknown"])("refuses %s as the availability of the QR", (qr) => {
    expect(
      paymentMethodAvailabilitySchema.safeParse({ qr, point: "available", point_minimum: 1500 })
        .success,
    ).toBe(false);
  });

  it("refuses an unknown availability of the terminal", () => {
    expect(
      paymentMethodAvailabilitySchema.safeParse({
        qr: "available",
        point: "unknown",
        point_minimum: 1500,
      }).success,
    ).toBe(false);
  });

  it.each(["qr", "point", "point_minimum"])("refuses an answer without its %s", (field) => {
    const answer: Record<string, unknown> = {
      qr: "available",
      point: "available",
      point_minimum: 1500,
    };
    delete answer[field];

    expect(paymentMethodAvailabilitySchema.safeParse(answer).success).toBe(false);
  });

  it.each([0, -1500, 15.5])("refuses %s as the terminal's minimum", (minimum) => {
    expect(
      paymentMethodAvailabilitySchema.safeParse({
        qr: "available",
        point: "available",
        point_minimum: minimum,
      }).success,
    ).toBe(false);
  });
});
