import { expect, test } from "vitest";
import { amountMessage, EMPTY_PRICE_FORM, typedUnitPrice } from "./price-form";

test.each([
  { amount: "", reason: "Ingresá el precio nuevo." },
  {
    amount: "12.50",
    reason: "Escribí el precio con coma para los decimales, por ejemplo 7.500,50.",
  },
  { amount: "0", reason: "Ingresá un precio mayor a cero, de hasta $ 21.474.836,47." },
  { amount: "21.474.836,48", reason: "Ingresá un precio mayor a cero, de hasta $ 21.474.836,47." },
])("a typed price of '$amount' can't be saved: $reason", ({ amount, reason }) => {
  expect(amountMessage({ ...EMPTY_PRICE_FORM, amount })).toBe(reason);
});

test("a typed price that can be saved is read in cents", () => {
  expect(typedUnitPrice("8.200,00")).toBe(820000);
  expect(typedUnitPrice("7500,5")).toBe(750050);
});

test.each(["", "  ", "12.50", "0", "21.474.836,48", "abc"])(
  "a typed price of '%s' has no price to read",
  (amount) => {
    expect(typedUnitPrice(amount)).toBeUndefined();
  },
);
