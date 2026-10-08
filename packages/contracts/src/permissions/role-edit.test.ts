import { describe, expect, it } from "vitest";
import { roleEditBodySchema } from "./role-edit.js";

function firstFailingField(body: unknown): unknown {
  const result = roleEditBodySchema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.path[0];
}

describe("roleEditBodySchema", () => {
  it("accepts a name, permissions and the version the role was loaded with", () => {
    const result = roleEditBodySchema.safeParse({
      name: "  Cajera  ",
      permissions: ["view_stock_balances"],
      version: 3,
    });

    expect(result).toMatchObject({
      success: true,
      data: { name: "Cajera", permissions: ["view_stock_balances"], version: 3 },
    });
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailingField({ name: "Cajera", permissions: [], version })).toBe("version");
  });

  it("holds the name and permissions to the same rules as a creation", () => {
    expect(firstFailingField({ name: "Administrador", permissions: [], version: 1 })).toBe("name");
    expect(firstFailingField({ name: "Cajera", permissions: ["nope"], version: 1 })).toBe(
      "permissions",
    );
  });

  it("reports the name and the permissions before the version when all are wrong", () => {
    expect(firstFailingField({ name: "", permissions: "nope", version: 0 })).toBe("name");
    expect(firstFailingField({ name: "Cajera", permissions: "nope", version: 0 })).toBe(
      "permissions",
    );
  });
});
