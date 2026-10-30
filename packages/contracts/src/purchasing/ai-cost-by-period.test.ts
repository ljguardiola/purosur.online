import { describe, expect, it } from "vitest";
import { aiCostByPeriodQuerySchema, aiCostByPeriodSchema } from "./ai-cost-by-period.js";

describe("aiCostByPeriodQuerySchema", () => {
  it.each(["day", "supplier", "person"])("accepts grouping by %s without a period", (group_by) => {
    expect(aiCostByPeriodQuerySchema.parse({ group_by })).toEqual({ group_by });
  });

  it("accepts a period, also of a single day", () => {
    expect(
      aiCostByPeriodQuerySchema.parse({ from: "2026-09-01", to: "2026-10-06", group_by: "day" }),
    ).toEqual({ from: "2026-09-01", to: "2026-10-06", group_by: "day" });
    expect(
      aiCostByPeriodQuerySchema.safeParse({ from: "2026-10-06", to: "2026-10-06", group_by: "day" })
        .success,
    ).toBe(true);
  });

  it.each([
    ["no grouping", {}],
    ["a grouping the report does not have", { group_by: "register" }],
    ["only the first day", { from: "2026-09-01", group_by: "day" }],
    ["only the last day", { to: "2026-10-06", group_by: "day" }],
    [
      "a period that ends before it starts",
      { from: "2026-10-06", to: "2026-09-01", group_by: "day" },
    ],
    ["a day that is not a calendar day", { from: "2026-02-30", to: "2026-03-01", group_by: "day" }],
  ])("refuses %s", (_name, query) => {
    expect(aiCostByPeriodQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("aiCostByPeriodSchema", () => {
  const total = { costNanoUsd: 2_000, unpricedCalls: 1 };
  const cost = { reading: total, proposals: { costNanoUsd: 0, unpricedCalls: 0 }, total };
  const report = {
    range: { from: "2026-10-01", to: "2026-10-06" },
    groups: [{ key: "supplier-1", name: "Distribuidora Sur", ...cost }],
    total: cost,
  };

  it("accepts the groups of a range with their total", () => {
    expect(aiCostByPeriodSchema.parse(report)).toEqual(report);
  });

  it("accepts a group without a name, as a day has none", () => {
    const byDay = { ...report, groups: [{ key: "2026-10-01", name: null, ...cost }] };

    expect(aiCostByPeriodSchema.parse(byDay)).toEqual(byDay);
  });

  it("accepts a range without calls", () => {
    const zero = { costNanoUsd: 0, unpricedCalls: 0 };
    const empty = {
      range: report.range,
      groups: [],
      total: { reading: zero, proposals: zero, total: zero },
    };

    expect(aiCostByPeriodSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ["a range bound that is not a calendar day", { range: { from: "ayer", to: "2026-10-06" } }],
    ["no groups", { groups: undefined }],
    ["no total", { total: undefined }],
    ["a group without a key", { groups: [{ name: null, ...cost }] }],
    ["a group without a name", { groups: [{ key: "k", ...cost }] }],
    ["a group without a cost", { groups: [{ key: "k", name: null }] }],
  ])("refuses %s", (_name, change) => {
    expect(aiCostByPeriodSchema.safeParse({ ...report, ...change }).success).toBe(false);
  });
});
