import { describe, expect, it } from "vitest";
import { reportQuerySchema } from "./report-query.js";

const REGISTER_ID = "4b0d2c1e-7f3a-4e58-9a61-0c5d8e2f1a77";

describe("reportQuerySchema", () => {
  it("accepts a query asking for nothing", () => {
    expect(reportQuerySchema.parse({})).toEqual({});
  });

  it("accepts a range of calendar days and a register", () => {
    const query = { from: "2026-10-01", to: "2026-10-06", register_id: REGISTER_ID };

    expect(reportQuerySchema.parse(query)).toEqual(query);
  });

  it("reads a register id written in capitals as the lowercase id records are kept under", () => {
    expect(reportQuerySchema.parse({ register_id: REGISTER_ID.toUpperCase() })).toEqual({
      register_id: REGISTER_ID,
    });
  });

  it.each([
    ["a range ending before it starts", { from: "2026-10-06", to: "2026-10-05" }],
    ["a start without an end", { from: "2026-10-06" }],
    ["an end without a start", { to: "2026-10-06" }],
    ["a bound that is not a calendar day", { from: "2026-02-30", to: "2026-03-01" }],
    ["an empty bound", { from: "", to: "" }],
    ["a register that is not an id", { register_id: "caja-1" }],
  ])("refuses %s", (_name, query) => {
    expect(reportQuerySchema.safeParse(query).success).toBe(false);
  });
});
