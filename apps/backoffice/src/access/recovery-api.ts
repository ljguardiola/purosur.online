import type {
  RecoveryRedemptionBody,
  RecoveryRequestBody,
  RecoveryTokenBody,
} from "@purosur/contracts";

import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

const ROLLING_HOUR_RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type RecoveryRequestOutcome =
  | { kind: "sent" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

type RecoveryTokenErrorKind =
  | "invalid"
  | "burned"
  | "expired"
  | "validation_failed"
  | "already_registered";

export type RecoveryTokenOutcome<Value> =
  | { kind: "ok"; value: Value }
  | { kind: RecoveryTokenErrorKind }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RegistrationOptions = {
  displayName: string;
  options: PublicKeyCredentialCreationOptionsJSON;
};

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? seconds
    : ROLLING_HOUR_RATE_LIMIT_FALLBACK_SECONDS;
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The cloud answers identically, with no body, whether or not `email` belongs to a real account. */
export async function requestRecoveryLink(email: string): Promise<RecoveryRequestOutcome> {
  const requestBody: RecoveryRequestBody = { email };
  let response: Response;
  try {
    response = await postJson("/users/recovery/request", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "sent" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  return { kind: "failed" };
}

// `recovery_token_invalid`/`validation_failed` both answer 400, and `recovery_token_burned`/
// `recovery_token_expired` both answer 410: the body's `code` is the actual discriminator.
const TOKEN_ERROR_KIND_BY_CODE: Record<string, RecoveryTokenErrorKind> = {
  recovery_token_invalid: "invalid",
  recovery_token_burned: "burned",
  recovery_token_expired: "expired",
  validation_failed: "validation_failed",
  passkey_already_registered: "already_registered",
};

async function tokenErrorOutcome<Value>(response: Response): Promise<RecoveryTokenOutcome<Value>> {
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  const kind = body?.code ? TOKEN_ERROR_KIND_BY_CODE[body.code] : undefined;
  return kind ? { kind } : { kind: "failed" };
}

/** Hands back a still-live token's WebAuthn creation options and the account's display name; doesn't touch the token itself. */
export async function fetchRegistrationOptions(
  recoveryToken: string,
): Promise<RecoveryTokenOutcome<RegistrationOptions>> {
  const requestBody: RecoveryTokenBody = { recovery_token: recoveryToken };
  let response: Response;
  try {
    response = await postJson("/users/recovery/registration-options", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return tokenErrorOutcome(response);
  }
  const body = (await response.json()) as {
    passkey_registration_options: PublicKeyCredentialCreationOptionsJSON;
    display_name: string;
  };
  return {
    kind: "ok",
    value: { displayName: body.display_name, options: body.passkey_registration_options },
  };
}

/** Burns the token; never opens a session. */
export async function redeemRecovery(
  recoveryToken: string,
  passkeyRegistration: RegistrationResponseJSON,
  passkeyName: string,
): Promise<RecoveryTokenOutcome<{ userId: string }>> {
  const requestBody: RecoveryRedemptionBody = {
    recovery_token: recoveryToken,
    passkey_registration: passkeyRegistration,
    passkey_name: passkeyName,
  };
  let response: Response;
  try {
    response = await postJson("/users/recovery/redeem", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return tokenErrorOutcome(response);
  }
  const body = (await response.json()) as { user_id: string };
  return { kind: "ok", value: { userId: body.user_id } };
}
