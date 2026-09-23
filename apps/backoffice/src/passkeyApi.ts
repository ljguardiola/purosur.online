import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export type Passkey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type FetchPasskeysOutcome = { kind: "ok"; value: Passkey[] } | ErrorOutcome;

export type RegistrationChallenge = {
  reauthenticationOptions: PublicKeyCredentialRequestOptionsJSON;
  registrationOptions: PublicKeyCredentialCreationOptionsJSON;
};

export type FetchPasskeyRegistrationChallengeOutcome =
  | { kind: "ok"; value: RegistrationChallenge }
  | { kind: "no_passkey" }
  | ErrorOutcome;

export type RemovalChallenge = {
  reauthenticationOptions: PublicKeyCredentialRequestOptionsJSON;
};

export type FetchPasskeyRemovalChallengeOutcome =
  | { kind: "ok"; value: RemovalChallenge }
  | ErrorOutcome;

// Both the registration and removal endpoints answer 401 with either code, depending on whether
// the session itself ended or the reauthentication just failed to verify (passkeys-registration-route.ts,
// passkeys-removal-route.ts).
type ErrorOutcome = { kind: "unauthenticated" } | { kind: "failed" };
type ReauthenticatedActionErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "authentication_failed" }
  | { kind: "failed" };

export type RegisterPasskeyOutcome =
  | { kind: "ok"; value: Passkey }
  | { kind: "validation_failed" }
  | ReauthenticatedActionErrorOutcome;

export type RemovePasskeyOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | ReauthenticatedActionErrorOutcome;

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function passkeyFromRow(row: {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}): Passkey {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

/** Lists the signed-in account's own passkeys, oldest first (`GET /users/passkeys`). */
export async function fetchPasskeys(): Promise<FetchPasskeysOutcome> {
  let response: Response;
  try {
    response = await fetch("/users/passkeys");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as Array<{
    id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
  }>;
  return { kind: "ok", value: body.map(passkeyFromRow) };
}

/** Hands back a fresh reauthentication challenge and registration options for a new passkey (`POST /users/passkeys/registration-options`). */
export async function fetchPasskeyRegistrationChallenge(): Promise<FetchPasskeyRegistrationChallengeOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/passkeys/registration-options");
  } catch {
    return { kind: "failed" };
  }
  // The endpoint answers `authentication_failed` while the session is still open when the account
  // has no passkey left to reauthenticate with (passkeys-registration-route.ts).
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authentication_failed"
      ? { kind: "no_passkey" }
      : { kind: "unauthenticated" };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as {
    reauthentication_options: PublicKeyCredentialRequestOptionsJSON;
    passkey_registration_options: PublicKeyCredentialCreationOptionsJSON;
  };
  return {
    kind: "ok",
    value: {
      reauthenticationOptions: body.reauthentication_options,
      registrationOptions: body.passkey_registration_options,
    },
  };
}

/** Hands back a fresh reauthentication challenge for removing a passkey (`POST /users/passkeys/removal-options`). */
export async function fetchPasskeyRemovalChallenge(): Promise<FetchPasskeyRemovalChallengeOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/passkeys/removal-options");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as {
    reauthentication_options: PublicKeyCredentialRequestOptionsJSON;
  };
  return { kind: "ok", value: { reauthenticationOptions: body.reauthentication_options } };
}

async function reauthenticatedActionErrorOutcome(
  response: Response,
): Promise<ReauthenticatedActionErrorOutcome> {
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authentication_failed"
      ? { kind: "authentication_failed" }
      : { kind: "unauthenticated" };
  }
  return { kind: "failed" };
}

/** Verifies the reauthentication and the new passkey's registration, then registers it under `passkeyName` (`POST /users/passkeys`). */
export async function registerPasskey(
  reauthentication: AuthenticationResponseJSON,
  passkeyRegistration: RegistrationResponseJSON,
  passkeyName: string,
): Promise<RegisterPasskeyOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/passkeys", {
      reauthentication,
      passkey_registration: passkeyRegistration,
      passkey_name: passkeyName,
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json()) as {
      id: string;
      name: string;
      created_at: string;
      last_used_at: string | null;
    };
    return { kind: "ok", value: passkeyFromRow(body) };
  }
  if (response.status === 400) {
    return { kind: "validation_failed" };
  }
  return reauthenticatedActionErrorOutcome(response);
}

/** Verifies the reauthentication and removes the named passkey (`POST /users/passkeys/:id/remove`). */
export async function removePasskey(
  id: string,
  reauthentication: AuthenticationResponseJSON,
): Promise<RemovePasskeyOutcome> {
  let response: Response;
  try {
    response = await postJson(`/users/passkeys/${id}/remove`, { reauthentication });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  return reauthenticatedActionErrorOutcome(response);
}
