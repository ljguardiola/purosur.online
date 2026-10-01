import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { writeFailureOf } from "./fiscal-api-request";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: headers ?? {},
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a 401 asking for a recent passkey is authorization_required", async () => {
  expect(await writeFailureOf(jsonResponse(401, { code: "authorization_required" }))).toEqual({
    kind: "authorization_required",
  });
});

test("any other 401 is unauthenticated", async () => {
  expect(await writeFailureOf(jsonResponse(401, { code: "unauthenticated" }))).toEqual({
    kind: "unauthenticated",
  });
  expect(await writeFailureOf(jsonResponse(401))).toEqual({ kind: "unauthenticated" });
});

test("a 403 is forbidden", async () => {
  expect(await writeFailureOf(jsonResponse(403))).toEqual({ kind: "forbidden" });
});

test("a 429 is rate_limited with its Retry-After seconds", async () => {
  expect(await writeFailureOf(jsonResponse(429, undefined, { "Retry-After": "30" }))).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("any other status is failed", async () => {
  expect(await writeFailureOf(jsonResponse(500))).toEqual({ kind: "failed" });
});
