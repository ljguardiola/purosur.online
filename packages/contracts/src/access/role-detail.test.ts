import { describe, expect, it } from "vitest";
import { roleDetailSchema } from "./role-detail.js";

const cashier = {
  id: "role-1",
  name: "Cajero",
  is_administrator: false,
  permissions: ["view_catalog"],
  user_count: 1,
  version: 3,
  assigned_users: [{ id: "user-1", name: "Ana" }],
};

describe("roleDetailSchema", () => {
  it("accepts a role with assigned users and one with none", () => {
    expect(roleDetailSchema.safeParse(cashier).data).toEqual(cashier);
    const unassigned = { ...cashier, user_count: 0, assigned_users: [] };
    expect(roleDetailSchema.safeParse(unassigned).data).toEqual(unassigned);
  });

  it("strips keys it does not define, on the role and on its assigned users", () => {
    const body = {
      ...cashier,
      created_at: "today",
      assigned_users: [{ id: "user-1", name: "Ana", email: "ana@example.com" }],
    };

    expect(roleDetailSchema.safeParse(body).data).toEqual(cashier);
  });

  it.each([
    "id",
    "name",
    "is_administrator",
    "permissions",
    "user_count",
    "version",
    "assigned_users",
  ])("requires %s", (field) => {
    const { [field as keyof typeof cashier]: _omitted, ...rest } = cashier;

    expect(roleDetailSchema.safeParse(rest).success).toBe(false);
  });

  it.each(["id", "name"])("requires %s on an assigned user", (field) => {
    const { [field as "id" | "name"]: _omitted, ...user } = { id: "user-1", name: "Ana" };

    expect(roleDetailSchema.safeParse({ ...cashier, assigned_users: [user] }).success).toBe(false);
  });

  it.each([
    ["version", "3"],
    ["version", null],
    ["version", 1.5],
    ["assigned_users", null],
    ["assigned_users", {}],
    ["assigned_users", [{ id: 1, name: "Ana" }]],
    ["assigned_users", [{ id: "user-1", name: null }]],
    ["name", 1],
    ["user_count", "1"],
  ])("refuses %s as %j", (field, value) => {
    expect(roleDetailSchema.safeParse({ ...cashier, [field]: value }).success).toBe(false);
  });
});
