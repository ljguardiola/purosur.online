import { describe, expect, it } from "vitest";
import {
  registerFortnightScope,
  registerFortnightScopeRegisterId,
} from "./register-fortnight-scope.js";

const REGISTER_ID = "3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6";

describe("registerFortnightScope", () => {
  it("joins the register and the day the fortnight starts", () => {
    expect(registerFortnightScope(REGISTER_ID, "2026-10-16")).toBe(`${REGISTER_ID}:2026-10-16`);
  });

  it("tells apart the fortnights of one register and the registers of one fortnight", () => {
    const scopes = new Set([
      registerFortnightScope(REGISTER_ID, "2026-10-16"),
      registerFortnightScope(REGISTER_ID, "2026-11-01"),
      registerFortnightScope("other-register", "2026-10-16"),
    ]);

    expect(scopes.size).toBe(3);
  });
});

describe("registerFortnightScopeRegisterId", () => {
  it("answers the register of the scope", () => {
    expect(
      registerFortnightScopeRegisterId(registerFortnightScope(REGISTER_ID, "2026-10-16")),
    ).toBe(REGISTER_ID);
  });
});
