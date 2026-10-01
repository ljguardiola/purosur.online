import { countedCashRequestSchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  countedCashMessage,
  countedCashOf,
  countedCashRequestFrom,
  EMPTY_COUNTED_CASH_FORM,
  INVALID_COUNTED_CASH_MESSAGE,
} from "./counted-cash-form";

test("a typed count is read as cents", () => {
  const values = { countedCash: "31.500,50" };

  expect(countedCashRequestFrom(values)).toEqual({ counted_cash: 3_150_050 });
  expect(countedCashOf(values)).toBe(3_150_050);
});

test.each(["", "  ", "abc", "-5"])("a typed count of '%s' is not a count", (typed) => {
  const values = { countedCash: typed };

  expect(countedCashRequestSchema.safeParse(countedCashRequestFrom(values)).success).toBe(false);
  expect(countedCashOf(values)).toBeUndefined();
});

test.each([
  { typed: "", message: "Ingresá el efectivo contado." },
  { typed: "  ", message: "Ingresá el efectivo contado." },
  { typed: "abc", message: INVALID_COUNTED_CASH_MESSAGE },
  { typed: "-5", message: INVALID_COUNTED_CASH_MESSAGE },
])("a typed count of '$typed' asks: $message", ({ typed, message }) => {
  expect(countedCashMessage({ ...EMPTY_COUNTED_CASH_FORM, countedCash: typed })).toBe(message);
});
