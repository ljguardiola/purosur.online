import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

// The cloud's rate limiter uses a fixed one-hour window (request-recovery-route.ts,
// recovery-redemption-route.ts): the fallback a missing `Retry-After` header gets.
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

export type RecoveryRequestOutcome =
  | { kind: "sent" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RecoveryTokenErrorKind = "invalid" | "burned" | "expired" | "validation_failed";

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
  return Number.isFinite(seconds) && seconds > 0 ? seconds : RATE_LIMIT_WINDOW_SECONDS;
}

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Requests the recovery link for `email` (§9.7). The cloud answers identically, with no body, whether or not that address is registered. */
export async function requestRecoveryLink(email: string): Promise<RecoveryRequestOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/recovery/request", { email });
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

async function tokenErrorOutcome<Value>(response: Response): Promise<RecoveryTokenOutcome<Value>> {
  switch (response.status) {
    case 404:
      return { kind: "invalid" };
    case 409:
      return { kind: "burned" };
    case 410:
      return { kind: "expired" };
    case 400:
      return { kind: "validation_failed" };
    case 429:
      return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
    default:
      return { kind: "failed" };
  }
}

/** Hands back a still-live token's WebAuthn creation options and the account's display name, without touching the token (recovery-redemption-route.ts's `registration-options`). */
export async function fetchRegistrationOptions(
  recoveryToken: string,
): Promise<RecoveryTokenOutcome<RegistrationOptions>> {
  let response: Response;
  try {
    response = await postJson("/users/recovery/registration-options", {
      recovery_token: recoveryToken,
    });
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

/** Verifies the browser's registration response, burns the token and registers the new passkey. Never opens a session. */
export async function redeemRecovery(
  recoveryToken: string,
  passkeyRegistration: RegistrationResponseJSON,
): Promise<RecoveryTokenOutcome<{ userId: string }>> {
  let response: Response;
  try {
    response = await postJson("/users/recovery/redeem", {
      recovery_token: recoveryToken,
      passkey_registration: passkeyRegistration,
    });
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return tokenErrorOutcome(response);
  }
  const body = (await response.json()) as { user_id: string };
  return { kind: "ok", value: { userId: body.user_id } };
}
