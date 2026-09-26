import { describe, expect, it } from "vitest";
import { readRegisterName, registerNameValidationFailure } from "./register-validation.js";

describe("readRegisterName", () => {
  it("reads a trimmed name from the request body", () => {
    expect(readRegisterName({ name: "  Caja 1  " })).toBe("Caja 1");
  });

  it("reads undefined when the name is missing, not a string, or blank after trimming", () => {
    expect(readRegisterName({})).toBeUndefined();
    expect(readRegisterName({ name: 42 })).toBeUndefined();
    expect(readRegisterName({ name: "   " })).toBeUndefined();
  });
});

describe("registerNameValidationFailure", () => {
  it("rejects an empty or missing name", () => {
    expect(registerNameValidationFailure(undefined)).toMatchObject({ field: "name" });
  });

  it("accepts a non-empty name", () => {
    expect(registerNameValidationFailure("Caja 1")).toBeUndefined();
  });

  it("accepts a name of exactly 100 characters", () => {
    expect(registerNameValidationFailure("a".repeat(100))).toBeUndefined();
  });

  it("rejects a name longer than 100 characters", () => {
    expect(registerNameValidationFailure("a".repeat(101))).toMatchObject({ field: "name" });
  });

  it("counts each emoji as one character toward the 100-character limit", () => {
    expect(registerNameValidationFailure("🏪".repeat(100))).toBeUndefined();
    expect(registerNameValidationFailure("🏪".repeat(101))).toMatchObject({ field: "name" });
  });
});
