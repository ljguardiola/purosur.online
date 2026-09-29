import {
  type PasskeyRegistrationBody,
  type PasskeySummaryWire,
  passkeyListSchema,
  passkeyRegistrationChallengeSchema,
} from "@purosur/contracts";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

export type Passkey = ReturnType<typeof passkeyFromWire>;

export type FetchPasskeysOutcome = CloudReadOutcome<Passkey[]>;

type RegistrationChallenge = {
  registrationOptions: PublicKeyCredentialCreationOptionsJSON;
};

export type FetchPasskeyRegistrationChallengeOutcome =
  | { kind: "ok"; value: RegistrationChallenge }
  | GatedActionErrorOutcome;

// Gated by the shared passkey-authorization window instead of a per-action step-up, so a 401
// here means either the session ended or that window has lapsed, never a rejected assertion.
type GatedActionErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RegisterPasskeyOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed" }
  | { kind: "already_registered" }
  | GatedActionErrorOutcome;

export type RemovePasskeyOutcome = { kind: "ok" } | { kind: "not_found" } | GatedActionErrorOutcome;

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function passkeyFromWire(row: PasskeySummaryWire) {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

export function passkeyListFromWire(body: unknown): Passkey[] | undefined {
  const parsed = passkeyListSchema.safeParse(body);
  return parsed.success ? parsed.data.map(passkeyFromWire) : undefined;
}

// Oldest first.
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
  const passkeys = passkeyListFromWire(await response.json().catch(() => undefined));
  if (!passkeys) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: passkeys };
}

export async function fetchPasskeyRegistrationChallenge(): Promise<FetchPasskeyRegistrationChallengeOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/passkeys/registration-options");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return gatedActionErrorOutcome(response);
  }
  const body = passkeyRegistrationChallengeSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!body.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: { registrationOptions: body.data.passkey_registration_options } };
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

export async function registerPasskey(
  passkeyRegistration: RegistrationResponseJSON,
  passkeyName: string,
): Promise<RegisterPasskeyOutcome> {
  const requestBody: PasskeyRegistrationBody = {
    passkey_registration: passkeyRegistration,
    passkey_name: passkeyName,
  };
  let response: Response;
  try {
    response = await postJson("/users/passkeys", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return body.code === "passkey_already_registered"
      ? { kind: "already_registered" }
      : { kind: "validation_failed" };
  }
  return gatedActionErrorOutcome(response);
}

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
