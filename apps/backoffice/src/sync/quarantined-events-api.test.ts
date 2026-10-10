import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchQuarantinedEvents, releaseQuarantinedEvent } from "./quarantined-events-api";
import { quarantinedSale } from "./test-support/quarantined-events";

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

test("fetchQuarantinedEvents answers the listed events on 200", async () => {
  const body = { events: [quarantinedSale] };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  const outcome = await fetchQuarantinedEvents();

  expect(outcome).toEqual({ kind: "ok", value: body });
  expect(fetch).toHaveBeenCalledWith("/api/synced-events/quarantined");
});

test("fetchQuarantinedEvents fails on a body that does not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { events: [{ eventId: "event-1" }] }));

  expect(await fetchQuarantinedEvents()).toEqual({ kind: "failed" });
});

test("fetchQuarantinedEvents fails on a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  expect(await fetchQuarantinedEvents()).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("fetchQuarantinedEvents maps a %s response", async (status, expected) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await fetchQuarantinedEvents()).toEqual(expected);
});

test("fetchQuarantinedEvents reads the time to wait from a 429 response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "60" }));

  expect(await fetchQuarantinedEvents()).toEqual({ kind: "rate_limited", retryAfterSeconds: 60 });
});

test("fetchQuarantinedEvents fails when the request cannot be made", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("network"));

  expect(await fetchQuarantinedEvents()).toEqual({ kind: "failed" });
});

test("releaseQuarantinedEvent posts the release of that event and answers ok on 204", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(204));

  const outcome = await releaseQuarantinedEvent("event-1");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/synced-events/event-1/release", { method: "POST" });
});

test("releaseQuarantinedEvent answers not_quarantined on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, { code: "not_quarantined", message: "this event is not in quarantine" }),
  );

  expect(await releaseQuarantinedEvent("event-1")).toEqual({ kind: "not_quarantined" });
});

test("releaseQuarantinedEvent answers not_found on a 404 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found", message: "none" }));

  expect(await releaseQuarantinedEvent("event-1")).toEqual({ kind: "not_found" });
});

test.each([
  [409, { code: "not_found", message: "none" }],
  [404, { code: "not_quarantined", message: "none" }],
  [409, { code: "something_else" }],
  [404, undefined],
])("releaseQuarantinedEvent fails on a %s whose body does not match", async (status, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status, body));

  expect(await releaseQuarantinedEvent("event-1")).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
])("releaseQuarantinedEvent maps a %s response", async (status, expected) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status));

  expect(await releaseQuarantinedEvent("event-1")).toEqual(expected);
});

test("releaseQuarantinedEvent reads the time to wait from a 429 response", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await releaseQuarantinedEvent("event-1")).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("releaseQuarantinedEvent fails when the request cannot be made", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("network"));

  expect(await releaseQuarantinedEvent("event-1")).toEqual({ kind: "failed" });
});
