import { describe, expect, it } from "vitest";
import { ROLE_NAME_MAX_LENGTH, roleNameLength } from "./role-name.js";

describe("ROLE_NAME_MAX_LENGTH", () => {
  it("allows role names of up to 100 characters", () => {
    expect(ROLE_NAME_MAX_LENGTH).toBe(100);
  });
});

describe("roleNameLength", () => {
  it("counts each letter as one character", () => {
    expect(roleNameLength("Depósito")).toBe(8);
  });

  it("counts each emoji as one character", () => {
    expect(roleNameLength("🔑".repeat(3))).toBe(3);
    expect(roleNameLength("Caja 🔑")).toBe(6);
  });
});
