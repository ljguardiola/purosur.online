import { expect, test } from "vitest";
import { permissionCatalogFixture } from "../platform/test-support/permission-catalog";
import { permissionsOf, withRequiredPermissions } from "./permission-catalog";

test("permissionsOf lists every permission of every area, in the order the catalog gives them", () => {
  const permissions = permissionsOf(permissionCatalogFixture);

  expect(permissions).toHaveLength(49);
  expect(permissions.slice(0, 2).map(({ key }) => key)).toEqual([
    "sell_and_charge",
    "view_sales_history",
  ]);
  expect(permissions.at(-1)?.key).toBe("configure_branch");
});

test("withRequiredPermissions adds what each selected permission requires", () => {
  expect(withRequiredPermissions(permissionCatalogFixture, ["adjust_stock"])).toEqual(
    new Set(["adjust_stock", "view_stock_balances"]),
  );
});

test("withRequiredPermissions leaves a selection that already holds its requirements as it is", () => {
  const selection = ["sell_and_charge", "perform_stock_counts", "view_stock_balances"] as const;

  expect(withRequiredPermissions(permissionCatalogFixture, selection)).toEqual(new Set(selection));
});

test("withRequiredPermissions keeps a key the catalog does not know", () => {
  expect(
    withRequiredPermissions(permissionCatalogFixture, ["make_coffee" as "adjust_stock"]),
  ).toEqual(new Set(["make_coffee"]));
});
