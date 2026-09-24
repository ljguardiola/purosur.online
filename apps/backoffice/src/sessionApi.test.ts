import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  authenticate,
  checkSessionStatus,
  fetchAuthenticationOptions,
  fetchSession,
  signOut,
} from "./sessionApi";

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

test("fetchSession returns the signed-in user's identity on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      user_id: "user-1",
      display_name: "Lucas Guardiola",
      is_administrator: false,
    }),
  );

  const outcome = await fetchSession();

  expect(outcome).toEqual({
    kind: "ok",
    userId: "user-1",
    displayName: "Lucas Guardiola",
    isAdministrator: false,
  });
  expect(fetch).toHaveBeenCalledWith("/users/session");
});

test("fetchSession returns the signed-in user's permission keys when the server sends them", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      user_id: "user-1",
      display_name: "Lucas Guardiola",
      is_administrator: false,
      permissions: ["void_sale", "sell_and_charge"],
    }),
  );

  const outcome = await fetchSession();

  expect(outcome).toMatchObject({ permissions: ["void_sale", "sell_and_charge"] });
});

test("fetchSession reports isAdministrator true for an Administrator session", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      user_id: "user-1",
      display_name: "Lucas Guardiola",
      is_administrator: true,
    }),
  );

  const outcome = await fetchSession();

  expect(outcome).toMatchObject({ isAdministrator: true });
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

test("fetchSession carries the session's deadline so the caller can schedule its next check", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      user_id: "user-1",
      display_name: "Lucas Guardiola",
      expires_at: "2026-09-23T12:30:00.000Z",
      is_administrator: false,
    }),
  );

  await expect(fetchSession()).resolves.toEqual({
    kind: "ok",
    userId: "user-1",
    displayName: "Lucas Guardiola",
    expiresAt: "2026-09-23T12:30:00.000Z",
    isAdministrator: false,
  });
});

test("checkSessionStatus returns the session's deadline on 200, without touching activity", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { expires_at: "2026-09-23T12:30:00.000Z" }));

  const outcome = await checkSessionStatus();

  expect(outcome).toEqual({ kind: "ok", expiresAt: "2026-09-23T12:30:00.000Z" });
  expect(fetch).toHaveBeenCalledWith("/users/session/status");
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
    "/users/session/authentication-options",
    expect.objectContaining({ method: "POST" }),
  );
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
    "/users/session/authenticate",
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

test("signOut posts with no body and reports that the session was ended", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  await expect(signOut()).resolves.toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/users/session/sign-out",
    expect.objectContaining({ method: "POST" }),
  );
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
