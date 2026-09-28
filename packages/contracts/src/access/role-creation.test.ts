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

describe("roleCreationBodySchema, name", () => {
  it("accepts a name and trims it", () => {
    const result = roleCreationBodySchema.safeParse({ name: "  Depósito  ", permissions: [] });

    expect(result).toMatchObject({ success: true, data: { name: "Depósito" } });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j", (name) => {
    expect(firstFailingField({ name, permissions: [] })).toBe("name");
  });

  it("accepts a name of exactly the domain's maximum length", () => {
    expect(isAccepted({ name: "a".repeat(ROLE_NAME_MAX_LENGTH), permissions: [] })).toBe(true);
  });

  it("rejects a name longer than the domain's maximum length, measured after trimming", () => {
    expect(isAccepted({ name: `  ${"a".repeat(ROLE_NAME_MAX_LENGTH)}  `, permissions: [] })).toBe(
      true,
    );
    expect(firstFailingField({ name: "a".repeat(ROLE_NAME_MAX_LENGTH + 1), permissions: [] })).toBe(
      "name",
    );
  });

  it.each(["Administrador", "administrador", "ADMINISTRADOR", "  Administrador  "])(
    "rejects the Administrator role's own name: %j",
    (name) => {
      expect(firstFailingField({ name, permissions: [] })).toBe("name");
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
      expect(firstFailingField({ name: "Depósito", permissions })).toBe("permissions");
    },
  );

  it("rejects an unknown permission key", () => {
    expect(firstFailingField({ name: "Depósito", permissions: ["not_a_real_permission"] })).toBe(
      "permissions",
    );
  });

  it("rejects a repeated permission key", () => {
    expect(
      firstFailingField({
        name: "Depósito",
        permissions: ["view_stock_balances", "view_stock_balances"],
      }),
    ).toBe("permissions");
  });

  it("rejects both alert-view permissions together", () => {
    expect(
      firstFailingField({ name: "Depósito", permissions: [...ALERT_VIEW_PERMISSION_KEYS] }),
    ).toBe("permissions");
  });
});

describe("roleCreationBodySchema, order of checks", () => {
  it("reports the name before the permissions when both are wrong", () => {
    expect(firstFailingField({ name: "", permissions: "nope" })).toBe("name");
  });
});
