import { sessionAuthenticationBodySchema } from "@purosur/contracts";
import {
  admitSignInAttempt,
  confirmRejectedSignInAttempt,
  recordSignInLockout,
  type TrippedSignInLockout,
} from "@purosur/domain/access/use-cases";
import { consumeSignInChallenge, signInWithPasskey } from "@purosur/domain/credentials/use-cases";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireBackofficeOrigin } from "./backoffice-origin.js";
import { drizzleAccounts } from "./drizzle-accounts.js";
import { DrizzlePasskeySignInStore } from "./drizzle-passkey-sign-in-store.js";
import { DrizzleSignInLockoutLog } from "./drizzle-sign-in-lockout-log.js";
import { reportRecoveryBookkeepingError } from "./recovery-error-reporting.js";
import { resolveSourceAddress } from "./recovery-source-address.js";
import { PUBLIC_ACCESS, registerRouteAccess } from "./route-access.js";
import { readSessionCookie, serializeSessionCookie } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { DrizzleSignInChallenges } from "./sign-in-challenge.js";
import { DrizzleSignInLockoutStore } from "./sign-in-lockout.js";
import { webAuthnAssertionVerifier } from "./webauthn-assertion-verifier.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface SessionAuthenticateRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
  delay?: (ms: number) => Promise<void>;
  confirmRejectedSignInAttempt?: typeof confirmRejectedSignInAttempt;
  reportError?: (error: unknown) => void;
}

const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey could not be verified",
} as const;

// Distinct from AUTHENTICATION_FAILED_RESPONSE: credential ids are unguessable, so telling a
// device to forget a passkey the cloud never saved leaks nothing.
const UNKNOWN_PASSKEY_RESPONSE = {
  code: "unknown_passkey",
  message: "the passkey could not be verified",
} as const;

type SessionAuthenticationRejection =
  | typeof AUTHENTICATION_FAILED_RESPONSE
  | typeof UNKNOWN_PASSKEY_RESPONSE;

// Floors every rejection's response time so the known-passkey rejection reasons (bad signature,
// deactivated account, clone-signal counter) stay indistinguishable from each other by timing.
const FAILURE_RESPONSE_FLOOR_MS = 200;

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readAssertionChallenge(assertion: AuthenticationResponseJSON): string | undefined {
  try {
    const clientData: unknown = JSON.parse(
      Buffer.from(assertion.response.clientDataJSON, "base64url").toString("utf8"),
    );
    const challenge = (clientData as { challenge?: unknown }).challenge;
    return typeof challenge === "string" ? challenge : undefined;
  } catch {
    return undefined;
  }
}

// Checks the per-source-address lockout before ever looking up a credential, so a blocked
// address never learns whether it would have worked.
export function registerSessionAuthenticateRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionAuthenticateRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const delay = options.delay ?? defaultDelay;
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);
  const doConfirmRejectedSignInAttempt =
    options.confirmRejectedSignInAttempt ?? confirmRejectedSignInAttempt;
  const reportError = options.reportError ?? reportRecoveryBookkeepingError;

  async function rejectAuthentication(
    reply: FastifyReply,
    floor: Promise<void>,
    response: SessionAuthenticationRejection = AUTHENTICATION_FAILED_RESPONSE,
  ): Promise<void> {
    await floor;
    await reply.code(401).send(response);
  }

  // A bookkeeping failure here must not turn this uniform 401 into a 500 or skip the timing floor above.
  async function rejectSignInAttempt(
    sourceAddress: string,
    attemptedAt: Date,
    reply: FastifyReply,
    floor: Promise<void>,
    response: SessionAuthenticationRejection = AUTHENTICATION_FAILED_RESPONSE,
  ): Promise<void> {
    try {
      const confirmed = await doConfirmRejectedSignInAttempt(
        { store: new DrizzleSignInLockoutStore(options.db) },
        { sourceAddress, at: attemptedAt },
      );
      if (confirmed.trippedLockout) {
        await auditLockout(sourceAddress, confirmed.trippedLockout);
      }
    } catch (error) {
      reportError(error);
    }

    await rejectAuthentication(reply, floor, response);
  }

  async function auditLockout(sourceAddress: string, lockout: TrippedSignInLockout): Promise<void> {
    // A bookkeeping failure here must never turn this 429 into a 500.
    try {
      await recordSignInLockout(
        { log: new DrizzleSignInLockoutLog(options.db, now) },
        {
          lockoutId: lockout.id,
          sourceAddress,
          failureCount: lockout.failureCount,
          blockedUntil: lockout.blockedUntil,
        },
      );
    } catch (error) {
      reportError(error);
    }
  }

  app.post("/sessions", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
    const floor = delay(FAILURE_RESPONSE_FLOOR_MS);
    if (!requireBackofficeOrigin(request, reply, options.backofficeOrigin)) {
      return;
    }

    // Checked before anything is recorded, so a request with nothing to verify never takes a lockout slot.
    const body = sessionAuthenticationBodySchema.safeParse(request.body);
    if (!body.success) {
      await rejectAuthentication(reply, floor);
      return;
    }
    const assertion = body.data.assertion as AuthenticationResponseJSON;
    const challenge = readAssertionChallenge(assertion);
    if (challenge === undefined) {
      await rejectAuthentication(reply, floor);
      return;
    }

    const sourceAddress = resolveSourceAddress(request);
    const attemptedAt = now();
    const admission = await admitSignInAttempt(
      { store: new DrizzleSignInLockoutStore(options.db) },
      { sourceAddress, at: attemptedAt },
    );
    if (!admission.admitted) {
      if (admission.trippedLockout) {
        await auditLockout(sourceAddress, admission.trippedLockout);
      }
      const retryAfterSeconds = Math.ceil(
        (admission.blockedUntil.getTime() - attemptedAt.getTime()) / 1000,
      );
      await reply
        .header("Retry-After", String(retryAfterSeconds))
        .code(429)
        .send({ code: "rate_limited", message: "too many sign-in attempts" });
      return;
    }

    // Spent before the credential lookup, so it can't be replayed against a second credential id guess.
    const consumedChallenge = await consumeSignInChallenge(
      { challenges: new DrizzleSignInChallenges(options.db) },
      { challenge, at: attemptedAt },
    );

    const previousRawSessionId = readSessionCookie(request.headers.cookie);
    const rawSessionId = generateSessionId();
    const outcome = await signInWithPasskey(
      {
        accounts: drizzleAccounts(options.db),
        verifier: webAuthnAssertionVerifier({
          assertion,
          expectedChallenge: () => consumedChallenge.kind === "redeemed",
          config: webAuthnConfig,
        }),
        store: new DrizzlePasskeySignInStore(options.db),
      },
      {
        credentialId: assertion.id,
        attemptId: admission.attemptId,
        ...(previousRawSessionId
          ? { previousSessionKey: hashSessionId(previousRawSessionId) }
          : {}),
        sessionKey: hashSessionId(rawSessionId),
        at: attemptedAt,
      },
    );
    if (outcome.kind === "unknown_passkey") {
      await rejectSignInAttempt(sourceAddress, attemptedAt, reply, floor, UNKNOWN_PASSKEY_RESPONSE);
      return;
    }
    if (outcome.kind !== "signed_in") {
      await rejectSignInAttempt(sourceAddress, attemptedAt, reply, floor);
      return;
    }

    await reply.header("Set-Cookie", serializeSessionCookie(rawSessionId)).code(200).send();
  });
}
