import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FRONT_REGISTER_ID } from "../shell/test-support/report-fixtures";
import { fetchMarginReport } from "./margin-report-api";
import { categoryMarginReport } from "./test-support/margin-report-fixtures";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for the grouping alone when no range and no register are chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, categoryMarginReport));

  expect(await fetchMarginReport({ group: "category" })).toEqual({
    kind: "ok",
    value: categoryMarginReport,
  });
  expect(fetch).toHaveBeenCalledWith("/api/reports/margin?group=category");
});

test("asks for the grouping, the range and the register chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, categoryMarginReport));

  await fetchMarginReport({
    group: "product",
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });

  expect(fetch).toHaveBeenCalledWith(
    `/api/reports/margin?group=product&from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}`,
  );
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { ...categoryMarginReport, totals: { amount: 1 } }),
  );

  expect(await fetchMarginReport({ group: "category" })).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchMarginReport({ group: "category" })).toEqual(outcome);
});
