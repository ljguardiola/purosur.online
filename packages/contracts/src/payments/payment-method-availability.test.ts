import { describe, expect, it } from "vitest";
import { paymentMethodAvailabilitySchema } from "./payment-method-availability.js";

const MINIMUMS = { point_minimum: 1500, qr_minimum: 1500 };

describe("paymentMethodAvailabilitySchema", () => {
  it.each([
    { qr: "available", point: "available", ...MINIMUMS },
    { qr: "offline", point: "offline", ...MINIMUMS },
    { qr: "available", point: "below_minimum", ...MINIMUMS },
    { qr: "below_minimum", point: "available", ...MINIMUMS },
    { qr: "available", point: "not_configured", ...MINIMUMS },
    { qr: "not_configured", point: "available", ...MINIMUMS },
  ])("accepts %j", (availability) => {
    expect(paymentMethodAvailabilitySchema.parse(availability)).toEqual(availability);
  });

  it("refuses an unknown availability of the QR", () => {
    expect(
      paymentMethodAvailabilitySchema.safeParse({ qr: "unknown", point: "available", ...MINIMUMS })
        .success,
    ).toBe(false);
  });

  it("refuses an unknown availability of the terminal", () => {
    expect(
      paymentMethodAvailabilitySchema.safeParse({ qr: "available", point: "unknown", ...MINIMUMS })
        .success,
    ).toBe(false);
  });

  it.each(["qr", "point", "point_minimum", "qr_minimum"])(
    "refuses an answer without its %s",
    (field) => {
      const answer: Record<string, unknown> = {
        qr: "available",
        point: "available",
        ...MINIMUMS,
      };
      delete answer[field];

      expect(paymentMethodAvailabilitySchema.safeParse(answer).success).toBe(false);
    },
  );

  it.each([0, -1500, 15.5])("refuses %s as the terminal's minimum", (minimum) => {
    expect(
      paymentMethodAvailabilitySchema.safeParse({
        qr: "available",
        point: "available",
        ...MINIMUMS,
        point_minimum: minimum,
      }).success,
    ).toBe(false);
  });

  it.each([0, -1500, 15.5])("refuses %s as the QR's minimum", (minimum) => {
    expect(
      paymentMethodAvailabilitySchema.safeParse({
        qr: "available",
        point: "available",
        ...MINIMUMS,
        qr_minimum: minimum,
      }).success,
    ).toBe(false);
  });
});
