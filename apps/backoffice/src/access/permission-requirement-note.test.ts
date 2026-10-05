import type { PermissionCatalogWire } from "@purosur/contracts";
import { expect, test } from "vitest";
import { permissionCatalogFixture } from "../platform/test-support/permission-catalog";
import { permissionRequirementNote } from "./permission-requirement-note";

test("names the one checked permission that requires it", () => {
  expect(
    permissionRequirementNote(permissionCatalogFixture, "view_stock_balances", [
      "perform_stock_counts",
      "view_stock_balances",
    ]),
  ).toBe("Lo requiere «Recuentos».");
});

test("names every checked permission that requires it, joined in Spanish", () => {
  expect(
    permissionRequirementNote(permissionCatalogFixture, "view_stock_balances", [
      "record_stock_losses",
      "view_stock_balances",
      "perform_stock_counts",
      "adjust_stock",
    ]),
  ).toBe("Lo requieren «Recuentos», «Ajustes» y «Pérdidas».");
});

test("says nothing when no checked permission requires it", () => {
  expect(
    permissionRequirementNote(permissionCatalogFixture, "view_stock_balances", [
      "view_stock_balances",
    ]),
  ).toBeUndefined();
  expect(
    permissionRequirementNote(permissionCatalogFixture, "sell_and_charge", ["sell_and_charge"]),
  ).toBeUndefined();
});

test("names the checked permissions the catalog answers as requiring it", () => {
  const catalog: PermissionCatalogWire = [
    {
      area: "stock",
      permissions: [
        {
          key: "view_stock_balances",
          register_marker: "none",
          requires: [],
          required_by: ["adjust_stock"],
        },
        { key: "adjust_stock", register_marker: "none", requires: [], required_by: [] },
      ],
    },
  ];

  expect(
    permissionRequirementNote(catalog, "view_stock_balances", [
      "adjust_stock",
      "view_stock_balances",
    ]),
  ).toBe("Lo requiere «Ajustes».");
});
