import { describe, expect, it } from "vitest";
import { REGISTER_NAME_MAX_LENGTH, registerNameLength } from "./register-name";

describe("REGISTER_NAME_MAX_LENGTH", () => {
  it("allows register names of up to 100 characters", () => {
    expect(REGISTER_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("registerNameLength", () => {
  it("counts each letter as one character", () => {
    expect(registerNameLength("Caja 1")).toBe(6);
  });

  it("counts each emoji as one character", () => {
    expect(registerNameLength("🏪".repeat(3))).toBe(3);
  });
});
