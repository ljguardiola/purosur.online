import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchAiCostReport } from "./ai-cost-report-api";
import { AI_COST_BY_SUPPLIER } from "./test-support/ai-cost";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for the grouping alone when no range is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(AI_COST_BY_SUPPLIER)));

  expect(await fetchAiCostReport({ group_by: "supplier" })).toEqual({
    kind: "ok",
    value: AI_COST_BY_SUPPLIER,
  });
  expect(fetch).toHaveBeenCalledWith("/api/reports/ai-cost-by-period?group_by=supplier");
});

test("asks for the range and the grouping chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(AI_COST_BY_SUPPLIER)));

  await fetchAiCostReport({ from: "2026-10-01", to: "2026-10-31", group_by: "person" });

  expect(fetch).toHaveBeenCalledWith(
    "/api/reports/ai-cost-by-period?from=2026-10-01&to=2026-10-31&group_by=person",
  );
});

test("treats a body that does not match the report's shape as a failed load", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ ...AI_COST_BY_SUPPLIER, total: {} })),
  );

  expect(await fetchAiCostReport({ group_by: "day" })).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers a %s as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));

  expect(await fetchAiCostReport({ group_by: "day" })).toEqual(outcome);
});
