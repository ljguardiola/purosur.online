import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchRegistrationOptions, redeemRecovery, requestRecoveryLink } from "./recovery-api";
import { creationOptions } from "./test-support/creation-options";

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

test("requestRecoveryLink reports the field the cloud refused as validation_failed", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "email" }] }),
  );

  await expect(requestRecoveryLink("bad")).resolves.toEqual({
    kind: "validation_failed",
    field: "email",
  });
});

test("requestRecoveryLink reports failed when the network call itself rejects", async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));

  await expect(requestRecoveryLink("lucia.perez@purosur.online")).resolves.toEqual({
    kind: "failed",
  });
});

const registrationOptionsBody = {
  passkey_registration_options: creationOptions,
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
  ["a body with no options", { display_name: "Lucía Pérez" }],
  ["a body with no display name", { passkey_registration_options: creationOptions }],
  [
    "options with no rp",
    { passkey_registration_options: { ...creationOptions, rp: undefined }, display_name: "Lucía" },
  ],
  ["a body that is not an object", "options"],
])("fetchRegistrationOptions reports failed on %s", async (_, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(fetchRegistrationOptions("the-token")).resolves.toEqual({ kind: "failed" });
});

test("fetchRegistrationOptions reports failed on a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  await expect(fetchRegistrationOptions("the-token")).resolves.toEqual({ kind: "failed" });
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

test("redeemRecovery sends the token and the passkey registration with its name, reading nothing from the body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { user_id: "user-1" }));

  const outcome = await redeemRecovery("the-token", registration, "Notebook del local");

  expect(outcome).toEqual({ kind: "ok" });
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
  [400, "passkey_already_registered", "already_registered"],
])(
  "redeemRecovery maps status %d code %s to %s, discriminating by code",
  async (status, code, kind) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(status, { code }));

    await expect(redeemRecovery("the-token", registration, "Notebook del local")).resolves.toEqual({
      kind,
    });
  },
);

test("redeemRecovery reports the field the cloud refused with the validation failure", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "passkey_name" }] }),
  );

  await expect(redeemRecovery("the-token", registration, "Notebook del local")).resolves.toEqual({
    kind: "validation_failed",
    field: "passkey_name",
  });
});

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
