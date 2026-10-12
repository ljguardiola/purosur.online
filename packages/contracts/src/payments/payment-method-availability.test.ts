import { describe, expect, it } from "vitest";
import { paymentMethodAvailabilitySchema } from "./payment-method-availability.js";

describe("paymentMethodAvailabilitySchema", () => {
  it.each([
    { qr: "available", point: "available", point_minimum: 1500 },
    { qr: "offline", point: "offline", point_minimum: 1500 },
    { qr: "available", point: "below_minimum", point_minimum: 1500 },
  ])("accepts %j", (availability) => {
    expect(paymentMethodAvailabilitySchema.parse(availability)).toEqual(availability);
  });

  it.each(["below_minimum", "not_configured", "unknown"])(
    "refuses %s as the availability of the QR",
    (qr) => {
      expect(
        paymentMethodAvailabilitySchema.safeParse({ qr, point: "available", point_minimum: 1500 })
          .success,
      ).toBe(false);
    },
  );

  it.each(["not_configured", "unknown"])(
    "refuses %s as the availability of the terminal, which the register does not answer",
    (point) => {
      expect(
        paymentMethodAvailabilitySchema.safeParse({ qr: "available", point, point_minimum: 1500 })
          .success,
      ).toBe(false);
    },
  );

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
