import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchRegistrationOptions, redeemRecovery, requestRecoveryLink } from "./recoveryApi";

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

test("requestRecoveryLink posts the normalized request and reports it as sent on an empty 2xx", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await requestRecoveryLink("lucia.perez@purosur.online");

  expect(outcome).toEqual({ kind: "sent" });
  expect(fetch).toHaveBeenCalledWith(
    "/users/recovery/request",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email: "lucia.perez@purosur.online" }),
    }),
  );
});

test("requestRecoveryLink reports rate_limited with the Retry-After header in seconds", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited", message: "too many" }, { "Retry-After": "3600" }),
  );

  const outcome = await requestRecoveryLink("lucia.perez@purosur.online");

  expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 3600 });
});

test("requestRecoveryLink falls back to the hourly window when Retry-After is missing", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, { code: "rate_limited" }));

  const outcome = await requestRecoveryLink("lucia.perez@purosur.online");

  expect(outcome).toEqual({ kind: "rate_limited", retryAfterSeconds: 3600 });
});

test("requestRecoveryLink reports failed on any other status, including validation_failed and origin_rejected", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));

  await expect(requestRecoveryLink("bad")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { code: "origin_rejected" }));
  await expect(requestRecoveryLink("lucia.perez@purosur.online")).resolves.toEqual({
    kind: "failed",
  });
});

test("requestRecoveryLink reports failed when the network call itself rejects", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));

  await expect(requestRecoveryLink("lucia.perez@purosur.online")).resolves.toEqual({
    kind: "failed",
  });
});

const registrationOptionsBody = {
  passkey_registration_options: { challenge: "abc", rp: { id: "purosur.online" } },
  display_name: "Lucía Pérez",
};

test("fetchRegistrationOptions sends the token and returns the options and display name", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, registrationOptionsBody));

  const outcome = await fetchRegistrationOptions("the-token");

  expect(outcome).toEqual({
    kind: "ok",
    value: {
      displayName: "Lucía Pérez",
      options: registrationOptionsBody.passkey_registration_options,
    },
  });
  expect(fetch).toHaveBeenCalledWith(
    "/users/recovery/registration-options",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ recovery_token: "the-token" }),
    }),
  );
});

test.each([
  [400, "recovery_token_invalid", "invalid"],
  [410, "recovery_token_burned", "burned"],
  [410, "recovery_token_expired", "expired"],
])(
  "fetchRegistrationOptions maps status %d code %s to %s, discriminating by code",
  async (status, code, kind) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, { code }));

    await expect(fetchRegistrationOptions("the-token")).resolves.toEqual({ kind });
  },
);

test("fetchRegistrationOptions maps 429 to rate_limited with the Retry-After seconds", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "3600" }),
  );

  await expect(fetchRegistrationOptions("the-token")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 3600,
  });
});

test("fetchRegistrationOptions maps an unexpected status or network failure to failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchRegistrationOptions("the-token")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(fetchRegistrationOptions("the-token")).resolves.toEqual({ kind: "failed" });
});

const registration = { id: "cred-id" } as unknown as RegistrationResponseJSON;

test("redeemRecovery sends the token, the passkey registration and its name, returning the user id", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { user_id: "user-1" }));

  const outcome = await redeemRecovery("the-token", registration, "Notebook del local");

  expect(outcome).toEqual({ kind: "ok", value: { userId: "user-1" } });
  expect(fetch).toHaveBeenCalledWith(
    "/users/recovery/redeem",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        recovery_token: "the-token",
        passkey_registration: registration,
        passkey_name: "Notebook del local",
      }),
    }),
  );
});

test.each([
  [400, "recovery_token_invalid", "invalid"],
  [410, "recovery_token_burned", "burned"],
  [410, "recovery_token_expired", "expired"],
  [400, "validation_failed", "validation_failed"],
])(
  "redeemRecovery maps status %d code %s to %s, discriminating by code",
  async (status, code, kind) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, { code }));

    await expect(redeemRecovery("the-token", registration, "Notebook del local")).resolves.toEqual({
      kind,
    });
  },
);

test("redeemRecovery maps an unrecognized code at a known status to failed", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "something_unexpected" }));

  await expect(redeemRecovery("the-token", registration, "Notebook del local")).resolves.toEqual({
    kind: "failed",
  });
});

test("redeemRecovery maps 429 to rate_limited with the Retry-After seconds", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "3600" }),
  );

  await expect(redeemRecovery("the-token", registration, "Notebook del local")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 3600,
  });
});
