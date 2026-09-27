import { describe, expect, it } from "vitest";
import { roleNameValidationFailure, rolePermissionsValidationFailure } from "./role-validation.js";

describe("roleNameValidationFailure", () => {
  it("rejects an empty or missing name", () => {
    expect(roleNameValidationFailure(undefined)).toMatchObject({ field: "name" });
  });

  it("accepts a non-empty name", () => {
    expect(roleNameValidationFailure("Depósito")).toBeUndefined();
  });

  it("rejects a name longer than 100 characters", () => {
    expect(roleNameValidationFailure("a".repeat(101))).toEqual({
      field: "name",
      message: "name must be at most 100 characters",
    });
  });

  it.each(["Administrador", "administrador", "ADMINISTRADOR"])(
    "rejects the Administrator role's own name, case-insensitively: %s",
    (name) => {
      expect(roleNameValidationFailure(name)).toMatchObject({ field: "name" });
    },
  );
});

describe("rolePermissionsValidationFailure", () => {
  it("accepts no permissions", () => {
    expect(rolePermissionsValidationFailure([])).toBeUndefined();
  });

  it("accepts distinct known permission keys", () => {
    expect(
      rolePermissionsValidationFailure(["view_stock_balances", "view_branch_alerts"]),
    ).toBeUndefined();
  });

  it("rejects an unknown permission key", () => {
    expect(rolePermissionsValidationFailure(["not_a_real_permission"])).toMatchObject({
      field: "permissions",
    });
  });

  it("rejects a repeated permission key", () => {
    expect(
      rolePermissionsValidationFailure(["view_stock_balances", "view_stock_balances"]),
    ).toMatchObject({ field: "permissions" });
  });

  it("rejects both alert-view permissions together", () => {
    expect(
      rolePermissionsValidationFailure(["view_branch_alerts", "view_all_alerts"]),
    ).toMatchObject({ field: "permissions" });
  });
});
