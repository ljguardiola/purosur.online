import { expect, test } from "vitest";
import {
  amountMessage,
  cashMovementRequestFrom,
  EMPTY_CASH_MOVEMENT_FORM,
  INVALID_AMOUNT_MESSAGE,
  recordCashMovementFormRequestSchema,
} from "./cash-movement-form";

test("a movement is requested with its amount in cents and its reason trimmed", () => {
  const request = cashMovementRequestFrom({
    kind: "CASH_OUT",
    amount: "5.000,50",
    reason: "  Flete  ",
  });

  expect(request).toEqual({ kind: "CASH_OUT", amount: 500_050, reason: "Flete" });
  expect(recordCashMovementFormRequestSchema.safeParse(request).success).toBe(true);
});

test("an amount that is not one is rejected by the request's shape", () => {
  const request = cashMovementRequestFrom({
    ...EMPTY_CASH_MOVEMENT_FORM,
    amount: "abc",
    reason: "Cambio",
  });

  expect(recordCashMovementFormRequestSchema.safeParse(request).success).toBe(false);
});

test("a reason of only spaces is rejected by the request's shape", () => {
  const request = cashMovementRequestFrom({
    ...EMPTY_CASH_MOVEMENT_FORM,
    amount: "100",
    reason: "   ",
  });

  expect(recordCashMovementFormRequestSchema.safeParse(request).success).toBe(false);
});

test.each([
  { amount: "", message: "Ingresá el importe." },
  { amount: " ", message: "Ingresá el importe." },
  { amount: "abc", message: INVALID_AMOUNT_MESSAGE },
])("an amount of '$amount' asks: $message", ({ amount, message }) => {
  expect(amountMessage({ ...EMPTY_CASH_MOVEMENT_FORM, amount })).toBe(message);
});
