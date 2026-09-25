import {
  ROLE_NAME_MAX_LENGTH as SHARED_ROLE_NAME_MAX_LENGTH,
  roleNameLength as sharedRoleNameLength,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  ROLE_NAME_MAX_LENGTH,
  roleNameLength,
  roleNameValidationFailure,
} from "./role-validation.js";

describe("roleNameValidationFailure", () => {
  it("accepts a name of exactly 100 characters", () => {
    expect(roleNameValidationFailure("a".repeat(100))).toBeUndefined();
  });

  it("rejects a name longer than 100 characters", () => {
    expect(roleNameValidationFailure("a".repeat(101))).toMatchObject({ field: "name" });
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(roleNameValidationFailure("🔑".repeat(100))).toBeUndefined();
    expect(roleNameValidationFailure("🔑".repeat(101))).toMatchObject({ field: "name" });
  });
});

describe("the cloud's local role name limit", () => {
  it("matches the shared limit", () => {
    expect(ROLE_NAME_MAX_LENGTH).toBe(SHARED_ROLE_NAME_MAX_LENGTH);
  });

  it("counts a name's length the same way the shared contract does", () => {
    for (const name of ["Depósito", "🔑".repeat(3), "Caja 🔑 central"]) {
      expect(roleNameLength(name)).toBe(sharedRoleNameLength(name));
    }
  });
});
