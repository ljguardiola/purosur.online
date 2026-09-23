import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/browser";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  fetchPasskeyRegistrationChallenge,
  fetchPasskeyRemovalChallenge,
  fetchPasskeys,
  registerPasskey,
  removePasskey,
} from "./passkeyApi";

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
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
  expect(fetch).toHaveBeenCalledWith("/users/passkeys");
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

const reauthenticationOptions = { challenge: "reauth", rpId: "purosur.online" };
const registrationOptions = { challenge: "reg", rp: { id: "purosur.online" } };

test("fetchPasskeyRegistrationChallenge posts with no body and returns both option sets", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      reauthentication_options: reauthenticationOptions,
      passkey_registration_options: registrationOptions,
    }),
  );

  const outcome = await fetchPasskeyRegistrationChallenge();

  expect(outcome).toEqual({
    kind: "ok",
    value: { reauthenticationOptions, registrationOptions },
  });
  expect(fetch).toHaveBeenCalledWith(
    "/users/passkeys/registration-options",
    expect.objectContaining({ method: "POST" }),
  );
});

test("fetchPasskeyRegistrationChallenge reports unauthenticated on 401 and failed otherwise", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "unauthenticated" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "failed" });
});

test("fetchPasskeyRegistrationChallenge reports no_passkey when the account has no passkey to reauthenticate with", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authentication_failed" }));

  await expect(fetchPasskeyRegistrationChallenge()).resolves.toEqual({ kind: "no_passkey" });
});

test("fetchPasskeyRemovalChallenge posts with no body and returns the reauthentication options", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, { reauthentication_options: reauthenticationOptions }),
  );

  const outcome = await fetchPasskeyRemovalChallenge();

  expect(outcome).toEqual({ kind: "ok", value: { reauthenticationOptions } });
  expect(fetch).toHaveBeenCalledWith(
    "/users/passkeys/removal-options",
    expect.objectContaining({ method: "POST" }),
  );
});

test("fetchPasskeyRemovalChallenge reports unauthenticated on 401 and failed otherwise", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(fetchPasskeyRemovalChallenge()).resolves.toEqual({ kind: "unauthenticated" });

  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(fetchPasskeyRemovalChallenge()).resolves.toEqual({ kind: "failed" });
});

const reauthentication = { id: "existing-cred" } as unknown as AuthenticationResponseJSON;
const passkeyRegistration = { id: "new-cred" } as unknown as RegistrationResponseJSON;

test("registerPasskey posts the reauthentication, registration and trimmed name, returning the new passkey", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(200, {
      id: "pk-3",
      name: "Teléfono de Lucía",
      created_at: "2026-09-23T09:12:00.000Z",
      last_used_at: null,
    }),
  );

  const outcome = await registerPasskey(reauthentication, passkeyRegistration, "Teléfono de Lucía");

  expect(outcome).toEqual({
    kind: "ok",
    value: {
      id: "pk-3",
      name: "Teléfono de Lucía",
      createdAt: "2026-09-23T09:12:00.000Z",
      lastUsedAt: null,
    },
  });
  expect(fetch).toHaveBeenCalledWith(
    "/users/passkeys",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        reauthentication,
        passkey_registration: passkeyRegistration,
        passkey_name: "Teléfono de Lucía",
      }),
    }),
  );
});

test("registerPasskey reports unauthenticated when the session ended", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(registerPasskey(reauthentication, passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "unauthenticated",
  });
});

test("registerPasskey reports authentication_failed when the reauthentication did not verify", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authentication_failed" }));
  await expect(registerPasskey(reauthentication, passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "authentication_failed",
  });
});

test("registerPasskey reports validation_failed on 400", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { code: "validation_failed" }));
  await expect(registerPasskey(reauthentication, passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "validation_failed",
  });
});

test("registerPasskey reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(registerPasskey(reauthentication, passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "failed",
  });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(registerPasskey(reauthentication, passkeyRegistration, "Nombre")).resolves.toEqual({
    kind: "failed",
  });
});

test("removePasskey posts the reauthentication to the passkey's own removal endpoint", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200));

  const outcome = await removePasskey("pk-1", reauthentication);

  expect(outcome).toEqual({ kind: "ok" });
  expect(fetch).toHaveBeenCalledWith(
    "/users/passkeys/pk-1/remove",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ reauthentication }) }),
  );
});

test("removePasskey reports unauthenticated when the session ended", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "unauthenticated" }));
  await expect(removePasskey("pk-1", reauthentication)).resolves.toEqual({
    kind: "unauthenticated",
  });
});

test("removePasskey reports authentication_failed when the reauthentication did not verify", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401, { code: "authentication_failed" }));
  await expect(removePasskey("pk-1", reauthentication)).resolves.toEqual({
    kind: "authentication_failed",
  });
});

test("removePasskey reports not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));
  await expect(removePasskey("pk-1", reauthentication)).resolves.toEqual({ kind: "not_found" });
});

test("removePasskey reports failed on any other status or a network failure", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(500));
  await expect(removePasskey("pk-1", reauthentication)).resolves.toEqual({ kind: "failed" });

  vi.mocked(fetch).mockRejectedValue(new TypeError("down"));
  await expect(removePasskey("pk-1", reauthentication)).resolves.toEqual({ kind: "failed" });
});
