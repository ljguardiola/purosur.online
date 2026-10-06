import { describe, expect, it } from "vitest";
import { roleListSchema, roleSummarySchema } from "./role-summary.js";

const cashier = {
  id: "role-1",
  name: "Cajero",
  is_administrator: false,
  permissions: ["view_catalog", "manage_catalog"],
  user_count: 2,
  may_edit: true,
};
const administrator = {
  id: "role-2",
  name: null,
  is_administrator: true,
  permissions: [],
  user_count: 1,
  may_edit: false,
};

describe("roleSummarySchema", () => {
  it("accepts a named role and an unnamed administrator role", () => {
    expect(roleSummarySchema.safeParse(cashier).data).toEqual(cashier);
    expect(roleSummarySchema.safeParse(administrator).data).toEqual(administrator);
  });

  it("strips keys it does not define", () => {
    expect(roleSummarySchema.safeParse({ ...cashier, version: 4 }).data).toEqual(cashier);
  });

  it.each(["id", "name", "is_administrator", "permissions", "user_count", "may_edit"])(
    "requires %s",
    (field) => {
      const { [field as keyof typeof cashier]: _omitted, ...rest } = cashier;

      expect(roleSummarySchema.safeParse(rest).success).toBe(false);
    },
  );

  it.each([
    ["id", 1],
    ["id", null],
    ["name", 1],
    ["name", undefined],
    ["is_administrator", "false"],
    ["is_administrator", null],
    ["permissions", "view_catalog"],
    ["permissions", null],
    ["permissions", [1]],
    ["user_count", "2"],
    ["user_count", null],
    ["user_count", 1.5],
    ["may_edit", "true"],
    ["may_edit", null],
  ])("refuses %s as %j", (field, value) => {
    expect(roleSummarySchema.safeParse({ ...cashier, [field]: value }).success).toBe(false);
  });
});

describe("roleListSchema", () => {
  it("accepts a list of roles, empty or not", () => {
    expect(roleListSchema.safeParse([]).data).toEqual([]);
    expect(roleListSchema.safeParse([administrator, cashier]).data).toEqual([
      administrator,
      cashier,
    ]);
  });

  it.each([undefined, null, {}, "roles", cashier])("refuses %j as a list", (body) => {
    expect(roleListSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a list holding a malformed role", () => {
    expect(roleListSchema.safeParse([cashier, { ...administrator, user_count: "1" }]).success).toBe(
      false,
    );
  });
});
