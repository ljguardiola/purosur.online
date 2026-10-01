import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./session-authorization-api";

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

test("fetchSessionAuthorizationOptions posts with no body and returns the WebAuthn options", async () => {
  const options = { challenge: "session-auth", rpId: "purosur.online" };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { authorization_options: options }));

  const outcome = await fetchSessionAuthorizationOptions();

  expect(outcome).toEqual({ kind: "ok", value: options });
  expect(fetch).toHaveBeenCalledWith(
    "/api/sessions/current/authorization-challenges",
    expect.objectContaining({ method: "POST" }),
  );
});

test.each([
  ["a body with no options", {}],
  ["options with no challenge", { authorization_options: { rpId: "purosur.online" } }],
  ["options that are not an object", { authorization_options: "options" }],
])("fetchSessionAuthorizationOptions reports failed on %s", async (_, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(fetchSessionAuthorizationOptions()).resolves.toEqual({ kind: "failed" });
});

test("fetchSessionAuthorizationOptions reports failed on a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  await expect(fetchSessionAuthorizationOptions()).resolves.toEqual({ kind: "failed" });
});

test("fetchSessionAuthorizationOptions reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(fetchSessionAuthorizationOptions()).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchSessionAuthorizationOptions reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "120" }),
  );

  await expect(fetchSessionAuthorizationOptions()).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
});

test("fetchSessionAuthorizationOptions reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchSessionAuthorizationOptions()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(fetchSessionAuthorizationOptions()).resolves.toEqual({ kind: "failed" });
});

const authorization = { id: "existing-cred" } as unknown as AuthenticationResponseJSON;

test("authorizeSession puts the authorization and reports ok on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await authorizeSession(authorization);

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/sessions/current/authorization",
    expect.objectContaining({ method: "PUT", body: JSON.stringify({ authorization }) }),
  );
});

test("authorizeSession reports authentication_failed when the assertion did not verify", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authentication_failed" }));

  await expect(authorizeSession(authorization)).resolves.toEqual({ kind: "authentication_failed" });
});

test("authorizeSession reports unauthenticated when the session ended", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));

  await expect(authorizeSession(authorization)).resolves.toEqual({ kind: "unauthenticated" });
});

test("authorizeSession reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "60" }),
  );

  await expect(authorizeSession(authorization)).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
});

test("authorizeSession reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(authorizeSession(authorization)).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(authorizeSession(authorization)).resolves.toEqual({ kind: "failed" });
});
