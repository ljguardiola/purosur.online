import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchOwnAlertEmailOptIn,
  recordOwnAlertEmailOptIn,
  withdrawOwnAlertEmailOptIn,
  withdrawUserAlertEmailOptIn,
} from "./alert-email-opt-in-api";

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

const OPTED_IN_AT = "2026-03-14T15:00:00.000Z";

test("fetchOwnAlertEmailOptIn reads the moment the user opted in", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { opted_in_at: OPTED_IN_AT }));

  await expect(fetchOwnAlertEmailOptIn()).resolves.toEqual({
    kind: "ok",
    value: { optedInAt: OPTED_IN_AT },
  });
  expect(fetch).toHaveBeenCalledWith("/api/account/alert-email-opt-in");
});

test("fetchOwnAlertEmailOptIn reads no opt-in as null", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { opted_in_at: null }));

  await expect(fetchOwnAlertEmailOptIn()).resolves.toEqual({
    kind: "ok",
    value: { optedInAt: null },
  });
});

test("fetchOwnAlertEmailOptIn fails on a body that does not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { opted_in_at: "yesterday" }));

  await expect(fetchOwnAlertEmailOptIn()).resolves.toEqual({ kind: "failed" });
});

test("fetchOwnAlertEmailOptIn reports each refusal of a read", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401));
  await expect(fetchOwnAlertEmailOptIn()).resolves.toEqual({ kind: "unauthenticated" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403));
  await expect(fetchOwnAlertEmailOptIn()).resolves.toEqual({ kind: "forbidden" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(429, undefined, { "Retry-After": "90" }));
  await expect(fetchOwnAlertEmailOptIn()).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(500));
  await expect(fetchOwnAlertEmailOptIn()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValueOnce(new TypeError("down"));
  await expect(fetchOwnAlertEmailOptIn()).resolves.toEqual({ kind: "failed" });
});

test("recordOwnAlertEmailOptIn puts the opt-in with no body and returns the recorded moment", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { opted_in_at: OPTED_IN_AT }));

  await expect(recordOwnAlertEmailOptIn()).resolves.toEqual({
    kind: "ok",
    value: { optedInAt: OPTED_IN_AT },
  });
  expect(fetch).toHaveBeenCalledWith("/api/account/alert-email-opt-in", { method: "PUT" });
});

test("withdrawOwnAlertEmailOptIn deletes the opt-in with no body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { opted_in_at: null }));

  await expect(withdrawOwnAlertEmailOptIn()).resolves.toEqual({
    kind: "ok",
    value: { optedInAt: null },
  });
  expect(fetch).toHaveBeenCalledWith("/api/account/alert-email-opt-in", { method: "DELETE" });
});

test.each([
  ["recordOwnAlertEmailOptIn", recordOwnAlertEmailOptIn],
  ["withdrawOwnAlertEmailOptIn", withdrawOwnAlertEmailOptIn],
])("%s reports each refusal of a change", async (_name, change) => {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { opted_in_at: "yesterday" }));
  await expect(change()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { code: "authorization_required" }));
  await expect(change()).resolves.toEqual({ kind: "authorization_required" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { code: "unauthenticated" }));
  await expect(change()).resolves.toEqual({ kind: "unauthenticated" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(429, undefined, { "Retry-After": "90" }));
  await expect(change()).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 90 });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(500));
  await expect(change()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValueOnce(new TypeError("down"));
  await expect(change()).resolves.toEqual({ kind: "failed" });
});

test("withdrawUserAlertEmailOptIn deletes another user's opt-in with no body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { opted_in_at: null }));

  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/users/user-2/alert-email-opt-in", {
    method: "DELETE",
  });
});

test("withdrawUserAlertEmailOptIn fails on a body that does not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, {}));

  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({ kind: "failed" });
});

test("withdrawUserAlertEmailOptIn reports each refusal", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { code: "not_found" }));
  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({ kind: "not_found" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403, { code: "own_account" }));
  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({ kind: "own_account" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(403, { code: "forbidden" }));
  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({ kind: "forbidden" });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { code: "authorization_required" }));
  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({
    kind: "authorization_required",
  });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(401, { code: "unauthenticated" }));
  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({
    kind: "unauthenticated",
  });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(429, undefined, { "Retry-After": "90" }));
  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });

  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(500));
  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValueOnce(new TypeError("down"));
  await expect(withdrawUserAlertEmailOptIn("user-2")).resolves.toEqual({ kind: "failed" });
});
