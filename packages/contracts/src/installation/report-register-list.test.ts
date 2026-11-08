import { describe, expect, it } from "vitest";
import { reportRegisterListSchema } from "./report-register-list.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";

describe("reportRegisterListSchema", () => {
  it("accepts the registers a report can be filtered by", () => {
    const list = { registers: [{ id: REGISTER_ID, name: "Caja 1" }] };

    expect(reportRegisterListSchema.parse(list)).toEqual(list);
  });

  it("accepts a branch without registers", () => {
    expect(reportRegisterListSchema.parse({ registers: [] })).toEqual({ registers: [] });
  });

  it("refuses a register without a name", () => {
    expect(reportRegisterListSchema.safeParse({ registers: [{ id: REGISTER_ID }] }).success).toBe(
      false,
    );
  });
});
