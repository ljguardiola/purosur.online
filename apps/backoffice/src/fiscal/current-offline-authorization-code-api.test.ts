import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchCurrentOfflineAuthorizationCode } from "./current-offline-authorization-code-api";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

const stored = {
  offline_authorization_code: {
    code: "36251478963214",
    fortnight_start: "2026-11-01",
    fortnight_end: "2026-11-15",
    report_deadline: "2026-11-23",
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("reads the code stored for the current fortnight", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, stored));

  expect(await fetchCurrentOfflineAuthorizationCode()).toEqual({ kind: "ok", value: stored });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal/current-offline-authorization-code");
});

test("reads that no code is stored for the current fortnight", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { offline_authorization_code: null }));

  expect(await fetchCurrentOfflineAuthorizationCode()).toEqual({
    kind: "ok",
    value: { offline_authorization_code: null },
  });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchCurrentOfflineAuthorizationCode()).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchCurrentOfflineAuthorizationCode()).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("treats a body that does not match as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { offline_authorization_code: "x" }));

  expect(await fetchCurrentOfflineAuthorizationCode()).toEqual({ kind: "failed" });
});

test("treats a request that cannot be made as failed", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchCurrentOfflineAuthorizationCode()).toEqual({ kind: "failed" });
});
