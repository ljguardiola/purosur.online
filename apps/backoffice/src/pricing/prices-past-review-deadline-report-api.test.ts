import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchPricesPastReviewDeadlineReport } from "./prices-past-review-deadline-report-api";
import { pricesPastReviewDeadlineReport } from "./test-support/prices-past-review-deadline-report-fixtures";

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
  const report = pricesPastReviewDeadlineReport();
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, report));

  expect(await fetchPricesPastReviewDeadlineReport({})).toEqual({ kind: "ok", value: report });
  expect(fetch).toHaveBeenCalledWith("/api/reports/prices-past-review-deadline");
});

test("asks for the period chosen", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, pricesPastReviewDeadlineReport()));

  await fetchPricesPastReviewDeadlineReport({ from: "2026-12-01", to: "2026-12-31" });

  expect(fetch).toHaveBeenCalledWith(
    "/api/reports/prices-past-review-deadline?from=2026-12-01&to=2026-12-31",
  );
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchPricesPastReviewDeadlineReport({})).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchPricesPastReviewDeadlineReport({})).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("treats a body that does not match the report as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { prices: [{ id: 1 }] }));

  expect(await fetchPricesPastReviewDeadlineReport({})).toEqual({ kind: "failed" });
});

test("answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchPricesPastReviewDeadlineReport({})).toEqual({ kind: "failed" });
});
