import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { readCloudJson } from "./read-cloud-json";

const schema = z.object({ name: z.string() });

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

test("reads the body the schema accepts from the path", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { name: "x" }));

  expect(await readCloudJson("/api/thing", schema)).toEqual({ kind: "ok", value: { name: "x" } });
  expect(fetch).toHaveBeenCalledWith("/api/thing");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [400, { kind: "failed" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await readCloudJson("/api/thing", schema)).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await readCloudJson("/api/thing", schema)).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 12,
  });
});

test("treats a body the schema refuses as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { name: 3 }));

  expect(await readCloudJson("/api/thing", schema)).toEqual({ kind: "failed" });
});

test("treats a body that is not JSON as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  expect(await readCloudJson("/api/thing", schema)).toEqual({ kind: "failed" });
});

test("answers failed when the request cannot be sent", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await readCloudJson("/api/thing", schema)).toEqual({ kind: "failed" });
});
