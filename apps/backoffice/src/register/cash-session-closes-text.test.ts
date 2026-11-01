import { expect, test } from "vitest";
import { cashiersWithDifferenceText } from "./cash-session-closes-text";

const totals = { sessions: 0, net_difference: 0, with_difference: 0, cashiers: [] };

test("writes nothing when no cashier closed with a difference", () => {
  expect(cashiersWithDifferenceText(totals)).toBeUndefined();
});

test("writes each cashier with a difference and how many closes, unnamed ones as unidentified", () => {
  expect(
    cashiersWithDifferenceText({
      ...totals,
      cashiers: [
        { cashier_id: "c-1", cashier_name: "Tomás Ruiz", sessions: 2 },
        { cashier_id: "c-2", cashier_name: null, sessions: 1 },
      ],
    }),
  ).toBe("Tomás Ruiz 2 · Sin identificar 1");
});
