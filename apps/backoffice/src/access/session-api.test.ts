import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  authenticate,
  checkSessionStatus,
  fetchAuthenticationOptions,
  fetchSession,
  signOut,
} from "./session-api";

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

const sessionBody = {
  user_id: "user-1",
  display_name: "Lucas Guardiola",
  expires_at: "2026-09-23T12:30:00.000Z",
  is_administrator: false,
  permissions: ["void_sale", "sell_and_charge"],
  capabilities: ["stock_area", "branch_area"],
};

test("fetchSession returns the signed-in user's identity, capabilities and deadline on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, sessionBody));

  const outcome = await fetchSession();

  expect(outcome).toEqual({
    kind: "ok",
    userId: "user-1",
    displayName: "Lucas Guardiola",
    isAdministrator: false,
    expiresAt: "2026-09-23T12:30:00.000Z",
    capabilities: ["stock_area", "branch_area"],
  });
  expect(fetch).toHaveBeenCalledWith("/api/sessions/current");
});

test("fetchSession reports isAdministrator true for an Administrator session", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { ...sessionBody, is_administrator: true, capabilities: ["users_area"] }),
  );

  const outcome = await fetchSession();

  expect(outcome).toMatchObject({ isAdministrator: true, capabilities: ["users_area"] });
});

test("fetchSession reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(fetchSession()).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchSession reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchSession()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(fetchSession()).resolves.toEqual({ kind: "failed" });
});

test.each([
  ["a body with no user", { ...sessionBody, user_id: undefined }],
  ["a body with no deadline", { ...sessionBody, expires_at: undefined }],
  ["a body with no capabilities", { ...sessionBody, capabilities: undefined }],
  ["a body with an unknown capability", { ...sessionBody, capabilities: ["fly_the_moon"] }],
  ["an administrator flag that is not a boolean", { ...sessionBody, is_administrator: "no" }],
  ["a body that is not an object", "session"],
])("fetchSession reports failed on %s", async (_, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(fetchSession()).resolves.toEqual({ kind: "failed" });
});

test("fetchSession reports failed on a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  await expect(fetchSession()).resolves.toEqual({ kind: "failed" });
});

test("fetchSession reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "120" }),
  );

  await expect(fetchSession()).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
});

test("fetchSession falls back to the one-hour rolling window when Retry-After is missing on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, { code: "rate_limited" }));

  await expect(fetchSession()).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 60 * 60,
  });
});

test("checkSessionStatus returns the session's deadline on 200, without touching activity", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { expires_at: "2026-09-23T12:30:00.000Z" }));

  const outcome = await checkSessionStatus();

  expect(outcome).toEqual({ kind: "ok", expiresAt: "2026-09-23T12:30:00.000Z" });
  expect(fetch).toHaveBeenCalledWith("/api/sessions/current/expiration");
});

test("checkSessionStatus reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(checkSessionStatus()).resolves.toEqual({ kind: "unauthenticated" });
});

test("checkSessionStatus reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(checkSessionStatus()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(checkSessionStatus()).resolves.toEqual({ kind: "failed" });
});

test.each([
  ["a body with no deadline", {}],
  ["a deadline that is not a string", { expires_at: 1 }],
  ["a body that is not an object", "status"],
])("checkSessionStatus reports failed on %s", async (_, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(checkSessionStatus()).resolves.toEqual({ kind: "failed" });
});

test("checkSessionStatus reports failed on a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  await expect(checkSessionStatus()).resolves.toEqual({ kind: "failed" });
});

test("checkSessionStatus reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "120" }),
  );

  await expect(checkSessionStatus()).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
});

test("checkSessionStatus falls back to the one-hour rolling window when Retry-After is missing on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, { code: "rate_limited" }));

  await expect(checkSessionStatus()).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 60 * 60,
  });
});

test("fetchAuthenticationOptions posts with no body and returns the WebAuthn options", async () => {
  const options = { challenge: "abc", rpId: "purosur.online" };
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { passkey_authentication_options: options }),
  );

  const outcome = await fetchAuthenticationOptions();

  expect(outcome).toEqual({ kind: "ok", value: options });
  expect(fetch).toHaveBeenCalledWith(
    "/api/authentication-challenges",
    expect.objectContaining({ method: "POST" }),
  );
});

test.each([
  ["a body with no options", {}],
  ["options with no challenge", { passkey_authentication_options: { rpId: "purosur.online" } }],
  ["options that are not an object", { passkey_authentication_options: "options" }],
])("fetchAuthenticationOptions reports failed on %s", async (_, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(fetchAuthenticationOptions()).resolves.toEqual({ kind: "failed" });
});

test("fetchAuthenticationOptions reports failed on a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  await expect(fetchAuthenticationOptions()).resolves.toEqual({ kind: "failed" });
});

test("fetchAuthenticationOptions reports failed on any non-2xx status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "origin_rejected" }));
  await expect(fetchAuthenticationOptions()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(fetchAuthenticationOptions()).resolves.toEqual({ kind: "failed" });
});

const assertion = { id: "cred-1" } as unknown as AuthenticationResponseJSON;

test("authenticate posts the assertion and reports ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await authenticate(assertion);

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/sessions",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ assertion }) }),
  );
});

test("authenticate reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "900" }),
  );

  await expect(authenticate(assertion)).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 900,
  });
});

test("authenticate falls back to the fixed 15-minute lockout when Retry-After is missing", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, { code: "rate_limited" }));

  await expect(authenticate(assertion)).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 900,
  });
});

test("authenticate reports failed on a rejected credential, an origin mismatch, or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authentication_failed" }));
  await expect(authenticate(assertion)).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "origin_rejected" }));
  await expect(authenticate(assertion)).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(authenticate(assertion)).resolves.toEqual({ kind: "failed" });
});

test("authenticate reports unknown_passkey on a 401 carrying that code, discriminating it from any other rejection", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unknown_passkey" }));

  await expect(authenticate(assertion)).resolves.toEqual({ kind: "unknown_passkey" });
});

test("signOut deletes the current session with no body and reports that it was ended", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  await expect(signOut()).resolves.toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/sessions/current", { method: "DELETE" });
});

test("signOut reports ok on 401, where the cloud has no session left to end", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(signOut()).resolves.toEqual({ kind: "ok" });
});

test("signOut reports failed when the cloud never ended the session", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(signOut()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "origin_rejected" }));
  await expect(signOut()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(signOut()).resolves.toEqual({ kind: "failed" });
});

test("signOut reports rate_limited with the Retry-After seconds on 429, leaving the session live", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "300" }),
  );

  await expect(signOut()).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 300 });
});
