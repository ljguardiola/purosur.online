import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { closeFiscalTask, fetchFiscalTasks } from "./fiscal-tasks-api";
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

test("closes a fiscal task with the note of how it was regularized", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(204));

  expect(await closeFiscalTask("task-1", { note: "Regularizada con el contador" })).toEqual({
    kind: "ok",
  });
  expect(fetch).toHaveBeenCalledWith("/api/fiscal/tasks/task-1/closure", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: "Regularizada con el contador" }),
  });
});

test("tells a task that was already closed from one that is not there", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(409, { code: "already_closed" }));
  expect(await closeFiscalTask("task-1", { note: "Listo" })).toEqual({ kind: "already_closed" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { code: "not_found" }));
  expect(await closeFiscalTask("task-1", { note: "Listo" })).toEqual({ kind: "not_found" });
});

test("returns the field a 400 validation_failed names when closing a task", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "note" }] }),
  );

  expect(await closeFiscalTask("task-1", { note: "Listo" })).toEqual({
    kind: "validation_failed",
    field: "note",
  });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [400, { kind: "failed" }],
  [500, { kind: "failed" }],
])("answers %i to closing a task as %j", async (status, outcome) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await closeFiscalTask("task-1", { note: "Listo" })).toEqual(outcome);
});

test("reads the retry time when closing a task is rate limited", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "7" }));

  expect(await closeFiscalTask("task-1", { note: "Listo" })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 7,
  });
});

test("treats a close request that cannot be made as failed", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await closeFiscalTask("task-1", { note: "Listo" })).toEqual({ kind: "failed" });
});
