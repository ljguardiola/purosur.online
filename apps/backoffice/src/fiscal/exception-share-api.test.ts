import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchExceptionShareYear } from "./exception-share-api";
import { exceptionShareOf2026 } from "./test-support/exception-share-fixtures";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

const request = { fiscalAddressId: "fiscal-address-central", year: 2026 };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reads the year of the fiscal address asked for", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, exceptionShareOf2026));

  expect(await fetchExceptionShareYear(request)).toEqual({
    kind: "ok",
    value: exceptionShareOf2026,
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/fiscal/exception-share/fiscal-address-central?year=2026",
  );
});

test("encodes the id of the fiscal address in the path", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, exceptionShareOf2026));

  await fetchExceptionShareYear({ fiscalAddressId: "a/b c", year: 2025 });

  expect(fetch).toHaveBeenCalledWith("/api/fiscal/exception-share/a%2Fb%20c?year=2025");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [404, { kind: "not_found" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchExceptionShareYear(request)).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchExceptionShareYear(request)).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("fails when the body is not what the cloud's contract says", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { year: 2026 }));

  expect(await fetchExceptionShareYear(request)).toEqual({ kind: "failed" });
});

test("fails when the request does not reach the cloud", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchExceptionShareYear(request)).toEqual({ kind: "failed" });
});
