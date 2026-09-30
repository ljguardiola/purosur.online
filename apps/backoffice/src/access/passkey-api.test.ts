import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchPasskeyRegistrationChallenge,
  fetchPasskeys,
  registerPasskey,
  removePasskey,
} from "./passkey-api";
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

test("fetchPasskeys returns the account's own passkeys on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [
      {
        id: "pk-1",
        name: "Notebook del local",
        created_at: "2026-08-02T12:00:00.000Z",
        last_used_at: null,
      },
      {
        id: "pk-2",
        name: "Teléfono de Lucía",
        created_at: "2026-08-03T12:00:00.000Z",
        last_used_at: "2026-09-23T09:12:00.000Z",
      },
    ]),
  );

  const outcome = await fetchPasskeys();

  expect(outcome).toEqual({
    kind: "ok",
    value: [
      {
        id: "pk-1",
        name: "Notebook del local",
        createdAt: "2026-08-02T12:00:00.000Z",
        lastUsedAt: null,
      },
      {
        id: "pk-2",
        name: "Teléfono de Lucía",
        createdAt: "2026-08-03T12:00:00.000Z",
        lastUsedAt: "2026-09-23T09:12:00.000Z",
      },
    ],
  });
  expect(fetch).toHaveBeenCalledWith("/api/account/passkeys");
});

test("fetchPasskeys reports failed on a 200 whose body is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<!doctype html>", { status: 200 }));

  await expect(fetchPasskeys()).resolves.toEqual({ kind: "failed" });
});

test("fetchPasskeys reports failed on a 200 whose passkeys do not match the contract", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, [{ id: "pk-1", name: "Notebook", created_at: 1, last_used_at: null }]),
  );
  await expect(fetchPasskeys()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { passkeys: [] }));
  await expect(fetchPasskeys()).resolves.toEqual({ kind: "failed" });
});

test("fetchPasskeys reports unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(fetchPasskeys()).resolves.toEqual({ kind: "unauthenticated" });
});

test("fetchPasskeys reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchPasskeys()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
  await expect(fetchPasskeys()).resolves.toEqual({ kind: "failed" });
});

test("fetchPasskeys reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "180" }),
  );

  await expect(fetchPasskeys()).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 180 });
});

const registrationOptions = creationOptions;

test("fetchPasskeyRegistrationChallenge posts with no body and returns the registration options", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { passkey_registration_options: registrationOptions }),
  );

  const outcome = await fetchPasskeyRegistrationChallenge();

  expect(outcome).toEqual({ kind: "ok", value: { registrationOptions } });
  expect(fetch).toHaveBeenCalledWith(
    "/api/account/passkey-challenges",
    expect.objectContaining({ method: "POST" }),
  );
});

test.each([
  ["a body with no options", {}],
  [
    "options with no user",
    { passkey_registration_options: { ...creationOptions, user: undefined } },
  ],
  ["options that are not an object", { passkey_registration_options: "options" }],
])("fetchPasskeyRegistrationChallenge reports failed on %s", async (_, body) => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, body));

  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "failed" });
});

test("fetchPasskeyRegistrationChallenge reports failed on a body that is not JSON", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "failed" });
});

test("fetchPasskeyRegistrationChallenge reports unauthenticated on 401 and failed otherwise", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "unauthenticated" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "failed" });
});

test("fetchPasskeyRegistrationChallenge reports authorization_required on a 401 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));

  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({
    kind: "authorization_required",
  });
});

test("fetchPasskeyRegistrationChallenge reports rate_limited with the Retry-After seconds on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "45" }),
  );

  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 45,
  });
});

const passkeyRegistration = { id: "new-cred" } as unknown as RegistrationResponseJSON;

test("registerPasskey posts the registration and trimmed name, reading nothing from the body", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("<html>", { status: 200 }));

  const outcome = await registerPasskey(passkeyRegistration, "Teléfono de Lucía");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/account/passkeys",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        passkey_registration: passkeyRegistration,
        passkey_name: "Teléfono de Lucía",
      }),
    }),
  );
});

test("registerPasskey reports unauthenticated when the session ended", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "unauthenticated",
  });
});

test("registerPasskey reports authorization_required when the session has no valid passkey authorization", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));
  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "authorization_required",
  });
});

test("registerPasskey reports validation_failed on 400", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));
  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "validation_failed",
  });
});

test("registerPasskey reports the field the cloud refused with the validation failure", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, { code: "validation_failed", details: [{ field: "passkey_name" }] }),
  );
  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "validation_failed",
    field: "passkey_name",
  });
});

test("registerPasskey reports already_registered on a 400 carrying that code, discriminating it from any other validation failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "passkey_already_registered" }));
  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "already_registered",
  });
});

test("registerPasskey reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "failed",
  });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "failed",
  });
});

test("registerPasskey reports failed, not validation_failed, on a 400 whose body can't be read", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 400 }));

  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "failed",
  });
});

test("registerPasskey reports rate_limited with the Retry-After seconds on 429, registering nothing", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "30" }),
  );

  await expect(registerPasskey(passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("removePasskey deletes the passkey with no body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await removePasskey("pk-1");

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith("/api/account/passkeys/pk-1", { method: "DELETE" });
});

test("removePasskey reports unauthenticated when the session ended", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(removePasskey("pk-1")).resolves.toEqual({
    kind: "unauthenticated",
  });
});

test("removePasskey reports authorization_required when the session has no valid passkey authorization", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authorization_required" }));
  await expect(removePasskey("pk-1")).resolves.toEqual({
    kind: "authorization_required",
  });
});

test("removePasskey reports not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));
  await expect(removePasskey("pk-1")).resolves.toEqual({ kind: "not_found" });
});

test("removePasskey reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(removePasskey("pk-1")).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(removePasskey("pk-1")).resolves.toEqual({ kind: "failed" });
});

test("removePasskey reports rate_limited with the Retry-After seconds on 429, removing nothing", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(429, { code: "rate_limited" }, { "Retry-After": "90" }),
  );

  await expect(removePasskey("pk-1")).resolves.toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
});
