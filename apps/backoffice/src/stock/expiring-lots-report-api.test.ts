import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchExpiringLotsReport } from "./expiring-lots-report-api";
import { expiringLotsReport } from "./test-support/expiring-lots-report-fixtures";

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

test("asks for the branch's window when no period is chosen", async () => {
  const report = expiringLotsReport();
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, report));

  expect(await fetchExpiringLotsReport({})).toEqual({ kind: "ok", value: report });
  expect(fetch).toHaveBeenCalledWith("/api/reports/expiring-lots");
});

test("asks for the period chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, expiringLotsReport()));

  await fetchExpiringLotsReport({ from: "2026-12-01", to: "2026-12-31" });

  expect(fetch).toHaveBeenCalledWith("/api/reports/expiring-lots?from=2026-12-01&to=2026-12-31");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchExpiringLotsReport({})).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchExpiringLotsReport({})).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { lots: [{ id: 1 }] }));

  expect(await fetchExpiringLotsReport({})).toEqual({ kind: "failed" });
});

test("answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchExpiringLotsReport({})).toEqual({ kind: "failed" });
});
