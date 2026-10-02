import { ALERT_VIEW_PERMISSION_KEYS, PERMISSION_KEYS, ROLE_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { roleCreationBodySchema } from "./role-creation.js";

function firstFailingField(body: unknown): unknown {
  const result = roleCreationBodySchema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.path[0];
}

function isAccepted(body: unknown): boolean {
  return roleCreationBodySchema.safeParse(body).success;
}

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = roleCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("roleCreationBodySchema, name", () => {
  it("accepts a name and trims it", () => {
    const result = roleCreationBodySchema.safeParse({ name: "  Depósito  ", permissions: [] });

    expect(result).toMatchObject({ success: true, data: { name: "Depósito" } });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j", (name) => {
    expect(firstFailure({ name, permissions: [] })).toEqual({
      field: "name",
      message: "name must not be empty",
    });
  });

  it("accepts a name of exactly the domain's maximum length", () => {
    expect(isAccepted({ name: "a".repeat(ROLE_NAME_MAX_LENGTH), permissions: [] })).toBe(true);
  });

  it("rejects a name longer than the domain's maximum length, measured after trimming", () => {
    expect(isAccepted({ name: `  ${"a".repeat(ROLE_NAME_MAX_LENGTH)}  `, permissions: [] })).toBe(
      true,
    );
    expect(firstFailure({ name: "a".repeat(ROLE_NAME_MAX_LENGTH + 1), permissions: [] })).toEqual({
      field: "name",
      message: `name must be at most ${ROLE_NAME_MAX_LENGTH} characters`,
    });
  });

  it.each(["Administrador", "administrador", "ADMINISTRADOR", "  Administrador  "])(
    "rejects the Administrator role's own name: %j",
    (name) => {
      expect(firstFailure({ name, permissions: [] })).toEqual({
        field: "name",
        message: "name must not be the Administrator role's own name",
      });
    },
  );
});

describe("roleCreationBodySchema, permissions", () => {
  it("accepts no permissions and distinct known permission keys, keeping their order", () => {
    const permissions = ["view_stock_balances", "adjust_stock"];

    expect(isAccepted({ name: "Depósito", permissions: [] })).toBe(true);
    expect(roleCreationBodySchema.safeParse({ name: "Depósito", permissions })).toMatchObject({
      success: true,
      data: { permissions },
    });
  });

  it("accepts every known permission key except one of the alert-view pair", () => {
    const [, dropped] = ALERT_VIEW_PERMISSION_KEYS;

    expect(
      isAccepted({ name: "Todo", permissions: PERMISSION_KEYS.filter((key) => key !== dropped) }),
    ).toBe(true);
  });

  it.each([undefined, null, "view_stock_balances", { 0: "view_stock_balances" }, [42], [null]])(
    "rejects permissions that are not a list of strings: %j",
    (permissions) => {
      expect(firstFailure({ name: "Depósito", permissions })).toEqual({
        field: "permissions",
        message: "permissions must be an array of permission keys",
      });
    },
  );

  it("rejects an unknown permission key", () => {
    expect(firstFailure({ name: "Depósito", permissions: ["not_a_real_permission"] })).toEqual({
      field: "permissions",
      message: "permissions must all be known permission keys",
    });
  });

  it("rejects a repeated permission key", () => {
    expect(
      firstFailure({
        name: "Depósito",
        permissions: ["view_stock_balances", "view_stock_balances"],
      }),
    ).toEqual({ field: "permissions", message: "permissions must not repeat a key" });
  });

  it("rejects both alert-view permissions together", () => {
    expect(
      firstFailure({ name: "Depósito", permissions: [...ALERT_VIEW_PERMISSION_KEYS] }),
    ).toEqual({
      field: "permissions",
      message: "a role can hold at most one of the alert-view permissions",
    });
  });
});

describe("roleCreationBodySchema, required permissions", () => {
  it("rejects a permission without one it requires", () => {
    expect(firstFailure({ name: "Depósito", permissions: ["record_stock_losses"] })).toEqual({
      field: "permissions",
      message: "permissions must include every permission they require",
    });
  });

  it("accepts a permission together with what it requires", () => {
    expect(
      isAccepted({ name: "Depósito", permissions: ["record_stock_losses", "view_stock_balances"] }),
    ).toBe(true);
  });
});

describe("roleCreationBodySchema, order of checks", () => {
  it("reports the name before the permissions when both are wrong", () => {
    expect(firstFailingField({ name: "", permissions: "nope" })).toBe("name");
  });
});

describe("roleCreationBodySchema, declared limits and rules", () => {
  function nameRules(name: string): unknown[] {
    const result = roleCreationBodySchema.shape.name.safeParse(name);
    return result.success ? [] : result.error.issues.map((issue) => issue.params?.["rule"]);
  }

  it("declares the name's maximum length", () => {
    expect(roleCreationBodySchema.shape.name.meta()).toEqual({ maxLength: ROLE_NAME_MAX_LENGTH });
  });

  it("names the rule of a name that is too long", () => {
    expect(nameRules("a".repeat(ROLE_NAME_MAX_LENGTH + 1))).toEqual(["max_length"]);
  });

  it("names the rule of the Administrator role's own name", () => {
    expect(nameRules("Administrador")).toEqual(["administrator_name"]);
  });
});
