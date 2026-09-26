import { describe, expect, it } from "vitest";
import { roleNameValidationFailure } from "./role-validation.js";

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
});
