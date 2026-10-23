import { expect, test } from "vitest";
import { unbilledDeferredSalesText } from "./unbilled-deferred-sales-text";

test.each([
  [3, 6, "3 ventas diferidas sin facturar · la más vieja de hace 6 días"],
  [3, 1, "3 ventas diferidas sin facturar · la más vieja de hace 1 día"],
  [3, 0, "3 ventas diferidas sin facturar · la más vieja de hoy"],
  [1200, 12, "1.200 ventas diferidas sin facturar · la más vieja de hace 12 días"],
  [1, 6, "1 venta diferida sin facturar · de hace 6 días"],
  [1, 1, "1 venta diferida sin facturar · de hace 1 día"],
  [1, 0, "1 venta diferida sin facturar · de hoy"],
])("writes %i sales, the oldest %i days old, as %s", (count, ageDays, text) => {
  expect(
    unbilledDeferredSalesText({
      count,
      oldest: { occurred_at: "2026-09-06T14:00:00.000Z", age_days: ageDays },
    }),
  ).toBe(text);
});

test("leaves out the age when the cloud names no oldest sale", () => {
  expect(unbilledDeferredSalesText({ count: 2, oldest: null })).toBe(
    "2 ventas diferidas sin facturar",
  );
});
