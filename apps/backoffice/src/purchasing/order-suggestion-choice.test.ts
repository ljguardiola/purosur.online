import { describe, expect, test } from "vitest";
import { chosenSupplierId, LEFT_OUT } from "./order-suggestion-choice";
import { ORDER_SUGGESTION } from "./test-support/order-suggestion";

const [almonds, cookies] = ORDER_SUGGESTION.lines as [
  (typeof ORDER_SUGGESTION.lines)[number],
  (typeof ORDER_SUGGESTION.lines)[number],
];
const mendoza = "5a900000-0000-4000-8000-000000000001";
const sur = "5a900000-0000-4000-8000-000000000002";
const known = new Set(["5a900000-0000-4000-8000-000000000009"]);

describe("chosenSupplierId", () => {
  test("proposes the supplier of the offer the cloud marks cheapest when nothing was chosen", () => {
    expect(chosenSupplierId(almonds, undefined, known)).toBe(mendoza);
  });

  test("follows the supplier chosen among the priced offers", () => {
    expect(chosenSupplierId(almonds, sur, known)).toBe(sur);
  });

  test("falls back to the cheapest when the chosen supplier is no longer offered", () => {
    expect(chosenSupplierId(almonds, "gone", known)).toBe(mendoza);
  });

  test("keeps a line left out of the order", () => {
    expect(chosenSupplierId(almonds, LEFT_OUT, known)).toBe(LEFT_OUT);
  });

  test("proposes no supplier for a line without priced offers", () => {
    expect(chosenSupplierId(cookies, undefined, known)).toBeNull();
  });

  test("follows a known supplier chosen for a line without priced offers", () => {
    expect(chosenSupplierId(cookies, "5a900000-0000-4000-8000-000000000009", known)).toBe(
      "5a900000-0000-4000-8000-000000000009",
    );
  });

  test("ignores a supplier that is not known for a line without priced offers", () => {
    expect(chosenSupplierId(cookies, "gone", known)).toBeNull();
  });

  test("keeps a line without priced offers left out of the order", () => {
    expect(chosenSupplierId(cookies, LEFT_OUT, known)).toBe(LEFT_OUT);
  });
});
