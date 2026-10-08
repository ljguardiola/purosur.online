import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchReportRegisters, fetchSalesReport } from "./sales-report-api";
import { FRONT_REGISTER_ID, registers, weekReport } from "./test-support/sales-fixtures";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("fetchSalesReport asks for no range and no register when none is chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, weekReport));

  expect(await fetchSalesReport({})).toEqual({ kind: "ok", value: weekReport });
  expect(fetch).toHaveBeenCalledWith("/api/reports/sales-by-day");
});

test("fetchSalesReport asks for the range and the register chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, weekReport));

  await fetchSalesReport({
    from: "2026-10-01",
    to: "2026-10-07",
    register_id: FRONT_REGISTER_ID,
  });

  expect(fetch).toHaveBeenCalledWith(
    `/api/reports/sales-by-day?from=2026-10-01&to=2026-10-07&register_id=${FRONT_REGISTER_ID}`,
  );
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [400, { kind: "failed" }],
  [500, { kind: "failed" }],
])("fetchSalesReport answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchSalesReport({})).toEqual(outcome);
});

test("fetchSalesReport reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchSalesReport({})).toEqual({ kind: "rate_limited", retryAfterSeconds: 12 });
});

test("fetchSalesReport treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ...weekReport, totals: { total: 1 } }));

  expect(await fetchSalesReport({})).toEqual({ kind: "failed" });
});

test("fetchSalesReport answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchSalesReport({})).toEqual({ kind: "failed" });
});

test("fetchReportRegisters reads the registers of the branch", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, registers));

  expect(await fetchReportRegisters()).toEqual({ kind: "ok", value: registers });
  expect(fetch).toHaveBeenCalledWith("/api/reports/registers");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchReportRegisters answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchReportRegisters()).toEqual(outcome);
});

test("fetchReportRegisters treats a body that does not match the list as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { registers: [{ id: "x" }] }));

  expect(await fetchReportRegisters()).toEqual({ kind: "failed" });
});
