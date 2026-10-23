import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchFiscalTasks } from "./fiscal-tasks-api";
import { fiscalTasks } from "./test-support/fiscal-task-fixtures";

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

test("reads the open fiscal tasks of the branch", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, fiscalTasks));

  expect(await fetchFiscalTasks()).toEqual({ kind: "ok", value: fiscalTasks });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal/tasks");
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("answers %i as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchFiscalTasks()).toEqual(outcome);
});

test("reads the retry time of a rate-limited response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));

  expect(await fetchFiscalTasks()).toEqual({ kind: "rate_limited", retryAfterSeconds: 12 });
});

test("treats a body that does not match the fiscal tasks as failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { tasks: [{ id: "task-1" }] }));

  expect(await fetchFiscalTasks()).toEqual({ kind: "failed" });
});

test("treats a request that cannot be made as failed", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchFiscalTasks()).toEqual({ kind: "failed" });
});
