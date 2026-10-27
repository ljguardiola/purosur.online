import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchCurrentZoneRules } from "./zone-rules-api";

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

const wire = {
  version: "2026a",
  transitions: [
    { from: "1970-01-01T00:00:00.000Z", offset_minutes: -180 },
    { from: "2030-03-01T03:00:00.000Z", offset_minutes: -120 },
  ],
};

test("fetchCurrentZoneRules returns the version and the transitions as dates on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, wire));

  const outcome = await fetchCurrentZoneRules();

  expect(outcome).toEqual({
    kind: "ok",
    value: {
      version: "2026a",
      transitions: [
        { from: new Date("1970-01-01T00:00:00.000Z"), offsetMinutes: -180 },
        { from: new Date("2030-03-01T03:00:00.000Z"), offsetMinutes: -120 },
      ],
    },
  });
  expect(fetch).toHaveBeenCalledWith("/api/zone-rules/current");
});

test("fetchCurrentZoneRules returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchCurrentZoneRules()).toEqual({ kind: "unauthenticated" });
});

test("fetchCurrentZoneRules returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchCurrentZoneRules()).toEqual({ kind: "forbidden" });
});

test("fetchCurrentZoneRules returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "120" }));

  expect(await fetchCurrentZoneRules()).toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
});

test("fetchCurrentZoneRules returns failed when the cloud has published no rules", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await fetchCurrentZoneRules()).toEqual({ kind: "failed" });
});

test("fetchCurrentZoneRules returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchCurrentZoneRules()).toEqual({ kind: "failed" });
});

test("fetchCurrentZoneRules returns failed on a server error", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));

  expect(await fetchCurrentZoneRules()).toEqual({ kind: "failed" });
});

test("fetchCurrentZoneRules returns failed on a 200 that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 200 }));

  expect(await fetchCurrentZoneRules()).toEqual({ kind: "failed" });
});

test("fetchCurrentZoneRules returns failed on a 200 whose rules do not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { version: "2026a", transitions: [] }));

  expect(await fetchCurrentZoneRules()).toEqual({ kind: "failed" });
});
