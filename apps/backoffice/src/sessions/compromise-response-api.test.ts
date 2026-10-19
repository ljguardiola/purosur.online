import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  endSessionsAndRemovePasskeys,
  fetchCompromiseResponse,
  forcePinResets,
  markItemDone,
  revokeEveryInstallation,
  startCompromiseResponse,
} from "./compromise-response-api";
import { ACCOUNT_ID, runbook, runbookBody } from "./test-support/compromise-response";

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

function lastRequest() {
  const [path, init] = vi.mocked(fetch).mock.calls[0] ?? [];
  return { path, method: init?.method, body: init?.body };
}

test("fetchCompromiseResponse reads the current runbook translating its fields from the wire", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, runbookBody(["revoke_every_installation"], [])),
  );

  const outcome = await fetchCompromiseResponse();

  expect(lastRequest().path).toBe("/api/compromise-responses/current");
  expect(outcome).toEqual({ kind: "ok", value: runbook(["revoke_every_installation"]) });
});

test("fetchCompromiseResponse answers no runbook when none was ever started", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(await fetchCompromiseResponse()).toEqual({ kind: "ok", value: null });
});

test("fetchCompromiseResponse fails on a body that does not match the runbook's shape", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "x" }));

  expect(await fetchCompromiseResponse()).toEqual({ kind: "failed" });
});

test.each([
  [401, { kind: "unauthenticated" }],
  [403, { kind: "forbidden" }],
  [500, { kind: "failed" }],
] as const)("fetchCompromiseResponse maps a %i to %o", async (status, expected) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(status, { code: "x" }));

  expect(await fetchCompromiseResponse()).toEqual(expected);
});

test("fetchCompromiseResponse reports a rate limit with its retry time", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await fetchCompromiseResponse()).toEqual({ kind: "rate_limited", retryAfterSeconds: 30 });
});

test("fetchCompromiseResponse fails when the network does", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));

  expect(await fetchCompromiseResponse()).toEqual({ kind: "failed" });
});

test("startCompromiseResponse posts and answers the runbook, whether it was started or already running", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, runbookBody()));

  const outcome = await startCompromiseResponse();

  expect(lastRequest()).toMatchObject({ path: "/api/compromise-responses", method: "POST" });
  expect(outcome).toEqual({ kind: "ok", value: runbook() });
});

test("revokeEveryInstallation posts to its step and answers the runbook", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, runbookBody(["revoke_every_installation"])));

  const outcome = await revokeEveryInstallation();

  expect(lastRequest()).toMatchObject({
    path: "/api/compromise-responses/current/steps/revoke-every-installation",
    method: "POST",
  });
  expect(outcome).toEqual({ kind: "ok", value: runbook(["revoke_every_installation"]) });
});

test("forcePinResets posts to its step and answers the runbook", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, runbookBody()));

  await forcePinResets();

  expect(lastRequest()).toMatchObject({
    path: "/api/compromise-responses/current/steps/force-pin-resets",
    method: "POST",
  });
});

test("endSessionsAndRemovePasskeys posts the chosen account to its step", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, runbookBody()));

  const outcome = await endSessionsAndRemovePasskeys({ account_id: ACCOUNT_ID });

  expect(lastRequest()).toMatchObject({
    path: "/api/compromise-responses/current/steps/end-sessions-and-remove-passkeys",
    method: "POST",
    body: JSON.stringify({ account_id: ACCOUNT_ID }),
  });
  expect(outcome).toEqual({ kind: "ok", value: runbook() });
});

test("markItemDone posts to the item's own path and answers the runbook", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, runbookBody([], ["claude_api_key"])));

  const outcome = await markItemDone("claude_api_key");

  expect(lastRequest()).toMatchObject({
    path: "/api/compromise-responses/current/items/claude_api_key",
    method: "POST",
  });
  expect(outcome).toEqual({ kind: "ok", value: runbook([], ["claude_api_key"]) });
});

test.each([
  "no_running_response",
  "out_of_order",
  "already_done",
] as const)("a step reports the runbook's %s refusal by name", async (code) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));

  expect(await forcePinResets()).toEqual({ kind: code });
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code }));
  expect(await markItemDone("notify")).toEqual({ kind: code });
});

test("a step fails on a 409 with a code it does not know", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "other" }));

  expect(await forcePinResets()).toEqual({ kind: "failed" });
});

test("a step asks for a fresh authorization on a 401 carrying authorization_required, and is signed out on any other", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));
  expect(await forcePinResets()).toEqual({ kind: "authorization_required" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  expect(await forcePinResets()).toEqual({ kind: "unauthenticated" });
});

test("a step maps a 403 to forbidden, a 429 to its retry time and anything else to failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));
  expect(await forcePinResets()).toEqual({ kind: "forbidden" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "12" }));
  expect(await forcePinResets()).toEqual({ kind: "rate_limited", retryAfterSeconds: 12 });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  expect(await forcePinResets()).toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
  expect(await forcePinResets()).toEqual({ kind: "failed" });
});

test("a step fails on a success body that does not match the runbook's shape", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "x" }));

  expect(await forcePinResets()).toEqual({ kind: "failed" });
});

test("endSessionsAndRemovePasskeys tells a missing account from the caller's own", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));
  expect(await endSessionsAndRemovePasskeys({ account_id: ACCOUNT_ID })).toEqual({
    kind: "not_found",
  });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "own_account" }));
  expect(await endSessionsAndRemovePasskeys({ account_id: ACCOUNT_ID })).toEqual({
    kind: "own_account",
  });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "forbidden" }));
  expect(await endSessionsAndRemovePasskeys({ account_id: ACCOUNT_ID })).toEqual({
    kind: "forbidden",
  });
});
