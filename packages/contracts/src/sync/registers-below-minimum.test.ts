import { describe, expect, it } from "vitest";
import {
  registersBelowMinimumQuerySchema,
  registersBelowMinimumSchema,
} from "./registers-below-minimum.js";

describe("the registers below a minimum query", () => {
  it("accepts a minimum of the form X.Y.Z", () => {
    expect(registersBelowMinimumQuerySchema.parse({ minimum: "1.4.0" })).toEqual({
      minimum: "1.4.0",
    });
  });

  it.each([undefined, "", "1.4", "v1.4.0", "1.4.0-beta", "latest"])(
    "refuses the minimum %j",
    (minimum) => {
      expect(registersBelowMinimumQuerySchema.safeParse({ minimum }).success).toBe(false);
    },
  );
});

describe("the registers below a minimum answer", () => {
  it("holds each register's name and the version it last reported, if any", () => {
    const body = {
      registers: [
        { register_name: "Caja 1", app_version: "1.3.0" },
        { register_name: "Caja 2", app_version: null },
      ],
    };

    expect(registersBelowMinimumSchema.parse(body)).toEqual(body);
  });

  it("accepts no registers", () => {
    expect(registersBelowMinimumSchema.parse({ registers: [] })).toEqual({ registers: [] });
  });

  it("carries nothing else about a register", () => {
    const parsed = registersBelowMinimumSchema.parse({
      registers: [{ register_name: "Caja 1", app_version: null, hostname: "CAJA-1" }],
    });

    expect(parsed.registers[0]).toEqual({ register_name: "Caja 1", app_version: null });
  });
});
