import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

// The backoffice API rate limiter counts a rolling one-hour window, the same fallback
// sessionApi.ts's own backoffice-rate-limited outcomes fall back to.
const RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type Passkey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type FetchPasskeysOutcome = { kind: "ok"; value: Passkey[] } | ErrorOutcome;

export type RegistrationChallenge = {
  registrationOptions: PublicKeyCredentialCreationOptionsJSON;
};

export type FetchPasskeyRegistrationChallengeOutcome =
  | { kind: "ok"; value: RegistrationChallenge }
  | ErrorOutcome;

type ErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };
// Every one of the account's own passkey actions is gated by the shared passkey-authorization
// window (`passkey-authorization-guard.ts`) instead of its own step-up, so a 401 here means either
// the session ended or that window has lapsed, never a rejected assertion.
type GatedActionErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RegisterPasskeyOutcome =
  | { kind: "ok"; value: Passkey }
  | { kind: "validation_failed" }
  | GatedActionErrorOutcome;

export type RemovePasskeyOutcome = { kind: "ok" } | { kind: "not_found" } | GatedActionErrorOutcome;

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : RATE_LIMIT_FALLBACK_SECONDS;
}

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
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
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

/** Hands back registration options for a new passkey (`POST /users/passkeys/registration-options`). */
export async function fetchPasskeyRegistrationChallenge(): Promise<FetchPasskeyRegistrationChallengeOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/passkeys/registration-options");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json()) as {
    passkey_registration_options: PublicKeyCredentialCreationOptionsJSON;
  };
  return { kind: "ok", value: { registrationOptions: body.passkey_registration_options } };
}

async function gatedActionErrorOutcome(response: Response): Promise<GatedActionErrorOutcome> {
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  return { kind: "failed" };
}

/**
 * Registers the new passkey's registration under `passkeyName`, gated by the shared
 * passkey-authorization window instead of its own reauthentication step-up
 * (`POST /users/passkeys`).
 */
export async function registerPasskey(
  passkeyRegistration: RegistrationResponseJSON,
  passkeyName: string,
): Promise<RegisterPasskeyOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/passkeys", {
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
  return gatedActionErrorOutcome(response);
}

/**
 * Removes the named passkey, gated by the shared passkey-authorization window instead of its own
 * reauthentication step-up (`POST /users/passkeys/:id/remove`).
 */
export async function removePasskey(id: string): Promise<RemovePasskeyOutcome> {
  let response: Response;
  try {
    response = await postJson(`/users/passkeys/${id}/remove`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  return gatedActionErrorOutcome(response);
}
