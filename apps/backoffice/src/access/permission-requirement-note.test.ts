import { expect, test } from "vitest";
import { permissionRequirementNote } from "./permission-requirement-note";

test("names the one checked permission that requires it", () => {
  expect(
    permissionRequirementNote("view_stock_balances", [
      "perform_stock_counts",
      "view_stock_balances",
    ]),
  ).toBe("Lo requiere «Recuentos».");
});

test("names every checked permission that requires it, joined in Spanish", () => {
  expect(
    permissionRequirementNote("view_stock_balances", [
      "record_stock_losses",
      "view_stock_balances",
      "perform_stock_counts",
      "adjust_stock",
    ]),
  ).toBe("Lo requieren «Recuentos», «Ajustes» y «Pérdidas».");
});

test("says nothing when no checked permission requires it", () => {
  expect(permissionRequirementNote("view_stock_balances", ["view_stock_balances"])).toBeUndefined();
  expect(permissionRequirementNote("sell_and_charge", ["sell_and_charge"])).toBeUndefined();
});
