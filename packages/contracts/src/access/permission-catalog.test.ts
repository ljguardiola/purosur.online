import type { PermissionArea, PermissionKey, PermissionRegisterMarker } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type PermissionCatalogWire,
  permissionAreaSchema,
  permissionCatalogSchema,
  permissionSchema,
} from "./permission-catalog.js";

const adjustStock = {
  key: "adjust_stock",
  register_marker: "none",
  requires: ["view_stock_balances"],
  required_by: [],
};
const viewStockBalances = {
  key: "view_stock_balances",
  register_marker: "none",
  requires: [],
  required_by: ["adjust_stock"],
};
const sellAndCharge = {
  key: "sell_and_charge",
  register_marker: "register",
  requires: [],
  required_by: [],
};
const stockArea = { area: "stock", permissions: [adjustStock] };
const cashRegisterArea = { area: "cashRegister", permissions: [sellAndCharge] };

describe("permissionSchema", () => {
  it("accepts a permission with or without requirements, required by others or not", () => {
    expect(permissionSchema.safeParse(adjustStock).data).toEqual(adjustStock);
    expect(permissionSchema.safeParse(viewStockBalances).data).toEqual(viewStockBalances);
    expect(permissionSchema.safeParse(sellAndCharge).data).toEqual(sellAndCharge);
  });

  it.each(["none", "register", "register_with_another_persons_pin"])(
    "accepts %s as the way the register uses a permission",
    (registerMarker) => {
      expect(
        permissionSchema.safeParse({ ...sellAndCharge, register_marker: registerMarker }).success,
      ).toBe(true);
    },
  );

  it("strips keys it does not define", () => {
    expect(permissionSchema.safeParse({ ...adjustStock, label: "Ajustes" }).data).toEqual(
      adjustStock,
    );
  });

  it.each(["key", "register_marker", "requires", "required_by"])("requires %s", (field) => {
    const { [field as keyof typeof adjustStock]: _omitted, ...rest } = adjustStock;

    expect(permissionSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["key", "make_coffee"],
    ["key", 1],
    ["key", null],
    ["register_marker", "pin"],
    ["register_marker", null],
    ["requires", "view_stock_balances"],
    ["requires", ["make_coffee"]],
    ["requires", [1]],
    ["requires", null],
    ["required_by", "adjust_stock"],
    ["required_by", ["make_coffee"]],
    ["required_by", [1]],
    ["required_by", null],
  ])("refuses %s as %j", (field, value) => {
    expect(permissionSchema.safeParse({ ...adjustStock, [field]: value }).success).toBe(false);
  });
});

describe("permissionAreaSchema", () => {
  it("accepts an area with its permissions", () => {
    expect(permissionAreaSchema.safeParse(stockArea).data).toEqual(stockArea);
  });

  it("strips keys it does not define", () => {
    expect(permissionAreaSchema.safeParse({ ...stockArea, label: "Stock" }).data).toEqual(
      stockArea,
    );
  });

  it.each(["area", "permissions"])("requires %s", (field) => {
    const { [field as keyof typeof stockArea]: _omitted, ...rest } = stockArea;

    expect(permissionAreaSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["area", "kitchen"],
    ["area", 1],
    ["area", null],
    ["permissions", adjustStock],
    ["permissions", null],
    ["permissions", [{ ...adjustStock, key: "make_coffee" }]],
  ])("refuses %s as %j", (field, value) => {
    expect(permissionAreaSchema.safeParse({ ...stockArea, [field]: value }).success).toBe(false);
  });
});

describe("permissionCatalogSchema", () => {
  it("accepts the areas in the order given", () => {
    expect(permissionCatalogSchema.safeParse([cashRegisterArea, stockArea]).data).toEqual([
      cashRegisterArea,
      stockArea,
    ]);
    expect(permissionCatalogSchema.safeParse([]).data).toEqual([]);
  });

  it.each([undefined, null, {}, "areas", stockArea])("refuses %j as a catalog", (body) => {
    expect(permissionCatalogSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a catalog holding a malformed area", () => {
    expect(
      permissionCatalogSchema.safeParse([stockArea, { ...cashRegisterArea, area: "kitchen" }])
        .success,
    ).toBe(false);
  });

  it("types an area, a key and a register marker as the domain's", () => {
    type Area = PermissionCatalogWire[number];
    type Permission = Area["permissions"][number];

    expectTypeOf<Area["area"]>().toEqualTypeOf<PermissionArea>();
    expectTypeOf<Permission["key"]>().toEqualTypeOf<PermissionKey>();
    expectTypeOf<Permission["requires"]>().toEqualTypeOf<PermissionKey[]>();
    expectTypeOf<Permission["required_by"]>().toEqualTypeOf<PermissionKey[]>();
    expectTypeOf<Permission["register_marker"]>().toEqualTypeOf<PermissionRegisterMarker>();
  });
});
