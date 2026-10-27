import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchCurrentStockReport } from "./current-stock-report-api";
import { currentStockReport, NUTS_CATEGORY_ID } from "./test-support/current-stock-report-fixtures";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for every category when none is chosen", async () => {
  const report = currentStockReport();
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, report));

  expect(await fetchCurrentStockReport({})).toEqual({ kind: "ok", value: report });
  expect(fetch).toHaveBeenCalledWith("/api/reports/current-stock");
});

test("asks for the category chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, currentStockReport()));

  await fetchCurrentStockReport({ category_id: NUTS_CATEGORY_ID });

  expect(fetch).toHaveBeenCalledWith(`/api/reports/current-stock?category_id=${NUTS_CATEGORY_ID}`);
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchCurrentStockReport({})).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchCurrentStockReport({})).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { products: [{ id: 1 }] }));

  expect(await fetchCurrentStockReport({})).toEqual({ kind: "failed" });
});

test("answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchCurrentStockReport({})).toEqual({ kind: "failed" });
});
