import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { unbilledDeferredSales } from "./test-support/fiscal-task-fixtures";
import { fetchUnbilledDeferredSales } from "./unbilled-deferred-sales-api";

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

test("reads the count of unbilled deferred sales of the branch", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, unbilledDeferredSales));

  expect(await fetchUnbilledDeferredSales()).toEqual({ kind: "ok", value: unbilledDeferredSales });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal/unbilled-deferred-sales");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchUnbilledDeferredSales()).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchUnbilledDeferredSales()).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("treats a body that does not match the unbilled deferred sales as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { count: -1, oldest: null }));

  expect(await fetchUnbilledDeferredSales()).toEqual({ kind: "failed" });
});

test("treats a request that cannot be made as failed", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchUnbilledDeferredSales()).toEqual({ kind: "failed" });
});
