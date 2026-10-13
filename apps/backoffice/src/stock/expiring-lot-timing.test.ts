import { expect, test } from "vitest";
import { expiryTiming } from "./expiring-lot-timing";

test.each([
  [{ expired: true, daysToExpiry: -1 }, "Venció ayer"],
  [{ expired: true, daysToExpiry: -3 }, "Venció hace 3 días"],
  [{ expired: false, daysToExpiry: 0 }, "Vence hoy"],
  [{ expired: false, daysToExpiry: 1 }, "Vence mañana"],
  [{ expired: false, daysToExpiry: 12 }, "Vence en 12 días"],
])("tells when the lot %j expires", (lot, text) => {
  expect(expiryTiming(lot)).toBe(text);
});
