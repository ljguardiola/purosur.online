import { describe, expect, it } from "vitest";
import { branchUserListSchema, branchUserSchema } from "./branch-user.js";

const ana = {
  id: "user-1",
  first_name: "Ana",
  email: "ana@example.com",
  version: 2,
  active: true,
  role: { id: "role-1", is_administrator: false, name: "Cajero" },
  passkey_count: 1,
  is_last_active_administrator: false,
};
const { active: _active, ...withoutActive } = ana;
const administrator = {
  ...ana,
  id: "user-2",
  role: { id: "role-2", is_administrator: true, name: null },
  is_last_active_administrator: true,
};

describe("branchUserSchema", () => {
  it("accepts a user with and without the active flag, and an unnamed role", () => {
    expect(branchUserSchema.safeParse(ana).data).toEqual(ana);
    expect(branchUserSchema.safeParse({ ...ana, active: false }).data).toEqual({
      ...ana,
      active: false,
    });
    expect(branchUserSchema.safeParse(withoutActive).data).toEqual(withoutActive);
    expect(branchUserSchema.safeParse(administrator).data).toEqual(administrator);
  });

  it("keeps the active flag absent instead of filling it in", () => {
    expect(branchUserSchema.safeParse(withoutActive).data).not.toHaveProperty("active");
  });

  it("strips keys it does not define, on the user and on its role", () => {
    const body = { ...ana, location_id: "branch-1", role: { ...ana.role, version: 3 } };

    expect(branchUserSchema.safeParse(body).data).toEqual(ana);
  });

  it.each([
    "id",
    "first_name",
    "email",
    "version",
    "role",
    "passkey_count",
    "is_last_active_administrator",
  ])("requires %s", (field) => {
    const { [field as keyof typeof ana]: _omitted, ...rest } = ana;

    expect(branchUserSchema.safeParse(rest).success).toBe(false);
  });

  it.each(["id", "is_administrator", "name"])("requires %s on the role", (field) => {
    const { [field as keyof typeof ana.role]: _omitted, ...role } = ana.role;

    expect(branchUserSchema.safeParse({ ...ana, role }).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["first_name", null],
    ["email", 1],
    ["version", "2"],
    ["version", null],
    ["version", 1.5],
    ["active", "true"],
    ["active", null],
    ["role", null],
    ["role", { ...ana.role, id: 1 }],
    ["role", { ...ana.role, is_administrator: "no" }],
    ["role", { ...ana.role, name: 1 }],
    ["role", { id: "role-1", is_administrator: false }],
    ["passkey_count", "1"],
    ["passkey_count", 0.5],
    ["is_last_active_administrator", "false"],
    ["is_last_active_administrator", null],
  ])("refuses %s as %j", (field, value) => {
    expect(branchUserSchema.safeParse({ ...ana, [field]: value }).success).toBe(false);
  });
});

describe("branchUserListSchema", () => {
  it("accepts a list of users, empty or not", () => {
    expect(branchUserListSchema.safeParse([]).data).toEqual([]);
    expect(branchUserListSchema.safeParse([ana, administrator]).data).toEqual([ana, administrator]);
  });

  it.each([undefined, null, {}, "users", ana])("refuses %j as a list", (body) => {
    expect(branchUserListSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a list holding a malformed user", () => {
    expect(branchUserListSchema.safeParse([ana, { ...administrator, version: "1" }]).success).toBe(
      false,
    );
  });
});
