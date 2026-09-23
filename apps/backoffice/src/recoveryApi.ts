import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

// The cloud's rate limiter counts a rolling one-hour window, so no wait is ever longer than an
// hour: the fallback a missing `Retry-After` header gets.
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

/** The cloud answers identically, with no body, whether or not `email` belongs to a real account. */
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

// The contract's `recovery_token_invalid` and `validation_failed` both answer 400, and
// `recovery_token_burned` and `recovery_token_expired` both answer 410 (§9.7), so the status alone
// no longer tells the two apart: the body's `code` is the actual discriminator.
const TOKEN_ERROR_KIND_BY_CODE: Record<string, RecoveryTokenErrorKind> = {
  recovery_token_invalid: "invalid",
  recovery_token_burned: "burned",
  recovery_token_expired: "expired",
  validation_failed: "validation_failed",
};

async function tokenErrorOutcome<Value>(response: Response): Promise<RecoveryTokenOutcome<Value>> {
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  const kind = body?.code ? TOKEN_ERROR_KIND_BY_CODE[body.code] : undefined;
  return kind ? { kind } : { kind: "failed" };
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
  passkeyName: string,
): Promise<RecoveryTokenOutcome<{ userId: string }>> {
  let response: Response;
  try {
    response = await postJson("/users/recovery/redeem", {
      recovery_token: recoveryToken,
      passkey_registration: passkeyRegistration,
      passkey_name: passkeyName,
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
