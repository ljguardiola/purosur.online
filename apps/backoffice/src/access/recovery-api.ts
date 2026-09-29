import {
  type RecoveryRedemptionBody,
  type RecoveryRequestBody,
  type RecoveryTokenBody,
  recoveryRegistrationOptionsSchema,
} from "@purosur/contracts";

import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

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

type RecoveryTokenRefusal =
  | { kind: RecoveryTokenErrorKind }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RegistrationOptionsOutcome =
  | { kind: "ok"; value: RegistrationOptions }
  | RecoveryTokenRefusal;

export type RedeemRecoveryOutcome = { kind: "ok" } | RecoveryTokenRefusal;

type RegistrationOptions = {
  displayName: string;
  options: PublicKeyCredentialCreationOptionsJSON;
};

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The cloud answers identically, with no body, whether or not `email` belongs to a real account.
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

async function tokenErrorOutcome(response: Response): Promise<RecoveryTokenRefusal> {
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  const kind = body?.code ? TOKEN_ERROR_KIND_BY_CODE[body.code] : undefined;
  return kind ? { kind } : { kind: "failed" };
}

// Leaves the still-live token untouched.
export async function fetchRegistrationOptions(
  recoveryToken: string,
): Promise<RegistrationOptionsOutcome> {
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
  const body = recoveryRegistrationOptionsSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!body.success) {
    return { kind: "failed" };
  }
  return {
    kind: "ok",
    value: {
      displayName: body.data.display_name,
      options: body.data.passkey_registration_options,
    },
  };
}

// Burns the token; never opens a session.
export async function redeemRecovery(
  recoveryToken: string,
  passkeyRegistration: RegistrationResponseJSON,
  passkeyName: string,
): Promise<RedeemRecoveryOutcome> {
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
  return { kind: "ok" };
}
