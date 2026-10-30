import { expect, test } from "vitest";
import { aiCostReportFilters } from "./ai-cost-report-filters";

test("opens the report on no period, grouped by supplier", () => {
  expect(aiCostReportFilters.parse({})).toEqual({ from: "", to: "", group: "supplier" });
});

test("keeps the period and the grouping a URL names", () => {
  const filters = { from: "2026-10-01", to: "2026-10-07", group: "day" };

  expect(aiCostReportFilters.parse(filters)).toEqual(filters);
  expect(aiCostReportFilters.parse({ group: "person" }).group).toBe("person");
});

test("falls back for a grouping the report does not offer", () => {
  expect(aiCostReportFilters.parse({ group: "month" }).group).toBe("supplier");
  expect(aiCostReportFilters.parse({ group: 3 }).group).toBe("supplier");
});

test("falls back to no period for one the cloud would refuse", () => {
  expect(aiCostReportFilters.parse({ from: "2026-10-07", to: "2026-10-01", group: "day" })).toEqual(
    {
      from: "",
      to: "",
      group: "day",
    },
  );
});
