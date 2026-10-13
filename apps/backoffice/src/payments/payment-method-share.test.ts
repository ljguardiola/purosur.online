import fc from "fast-check";
import { expect, test } from "vitest";
import { paymentMethodShare } from "./payment-method-share";

test("is the part of the total an amount makes up", () => {
  expect(paymentMethodShare(300_000, 1_200_000)).toBe(0.25);
});

test("is the whole when the amount is the total", () => {
  expect(paymentMethodShare(500, 500)).toBe(1);
});

test("is nothing when there is no total to share", () => {
  expect(paymentMethodShare(0, 0)).toBe(0);
});

test("stays between nothing and the whole for any amount within the total", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.integer({ min: 0, max: 1_000_000 }),
      (amount, extra) => {
        const share = paymentMethodShare(amount, amount + extra);

        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
      },
    ),
  );
});
