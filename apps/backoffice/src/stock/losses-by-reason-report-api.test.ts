import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchLossesByReasonReport } from "./losses-by-reason-report-api";
import { lossesByReasonReport } from "./test-support/losses-by-reason-report-fixtures";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    ...(headers === undefined ? {} : { headers }),
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks for the cloud's default period when none is chosen", async () => {
  const report = lossesByReasonReport();
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, report));

  expect(await fetchLossesByReasonReport({})).toEqual({ kind: "ok", value: report });
  expect(fetch).toHaveBeenCalledWith("/api/reports/losses-by-reason");
});

test("asks for the period chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, lossesByReasonReport()));

  await fetchLossesByReasonReport({ from: "2026-12-01", to: "2026-12-31" });

  expect(fetch).toHaveBeenCalledWith("/api/reports/losses-by-reason?from=2026-12-01&to=2026-12-31");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchLossesByReasonReport({})).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchLossesByReasonReport({})).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { reasons: [{ reason: "unknown" }] }));

  expect(await fetchLossesByReasonReport({})).toEqual({ kind: "failed" });
});

test("answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchLossesByReasonReport({})).toEqual({ kind: "failed" });
});
