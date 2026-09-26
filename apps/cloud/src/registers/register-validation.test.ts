import {
  REGISTER_NAME_MAX_LENGTH as SHARED_REGISTER_NAME_MAX_LENGTH,
  registerNameLength as sharedRegisterNameLength,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  REGISTER_NAME_MAX_LENGTH,
  readRegisterName,
  registerNameLength,
  registerNameValidationFailure,
} from "./register-validation.js";

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

describe("the cloud's local register name limit", () => {
  it("matches the shared limit", () => {
    expect(REGISTER_NAME_MAX_LENGTH).toBe(SHARED_REGISTER_NAME_MAX_LENGTH);
  });

  it("counts a name's length the same way the shared contract does", () => {
    for (const name of ["Caja 1", "🏪".repeat(3), "Caja de depósito"]) {
      expect(registerNameLength(name)).toBe(sharedRegisterNameLength(name));
    }
  });
});
