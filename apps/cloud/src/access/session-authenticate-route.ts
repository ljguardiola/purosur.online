import { sessionAuthenticationBodySchema } from "@purosur/contracts";
import { findSignInPasskey } from "@purosur/domain/access/use-cases";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { auditLog, passkeys, sessions } from "../platform/db/schema.js";
import { requireBackofficeOrigin } from "./backoffice-origin.js";
import { drizzleAccounts } from "./drizzle-accounts.js";
import { reportRecoveryBookkeepingError } from "./recovery-error-reporting.js";
import { resolveSourceAddress } from "./recovery-source-address.js";
import { PUBLIC_ACCESS, registerRouteAccess } from "./route-access.js";
import { readSessionCookie, serializeSessionCookie } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { consumeSignInChallenge } from "./sign-in-challenge.js";
import {
  admitSignInAttempt,
  confirmRejectedSignInAttempt,
  discardSignInAttempt,
  hashSourceAddress,
  type TrippedSignInLockout,
} from "./sign-in-lockout.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface SessionAuthenticateRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
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
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const delay = options.delay ?? defaultDelay;
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);
  const doConfirmRejectedSignInAttempt =
    options.confirmRejectedSignInAttempt ?? confirmRejectedSignInAttempt;
  const reportError = options.reportError ?? reportRecoveryBookkeepingError;

  async function rejectAuthentication(
    reply: FastifyReply,
    startedAt: number,
    response: SessionAuthenticationRejection = AUTHENTICATION_FAILED_RESPONSE,
  ): Promise<void> {
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs < FAILURE_RESPONSE_FLOOR_MS) {
      await delay(FAILURE_RESPONSE_FLOOR_MS - elapsedMs);
    }

    await reply.code(401).send(response);
  }

  // A bookkeeping failure here must not turn this uniform 401 into a 500 or skip the timing floor above.
  async function rejectSignInAttempt(
    sourceAddress: string,
    attemptedAt: Date,
    reply: FastifyReply,
    startedAt: number,
    response: SessionAuthenticationRejection = AUTHENTICATION_FAILED_RESPONSE,
  ): Promise<void> {
    try {
      const confirmed = await doConfirmRejectedSignInAttempt(options.db, {
        sourceAddress,
        now: attemptedAt,
      });
      if (confirmed.trippedLockout) {
        await auditLockout(sourceAddress, confirmed.trippedLockout);
      }
    } catch (error) {
      reportError(error);
    }

    await rejectAuthentication(reply, startedAt, response);
  }

  async function auditLockout(sourceAddress: string, lockout: TrippedSignInLockout): Promise<void> {
    // A bookkeeping failure here must never turn this 429 into a 500.
    try {
      await options.db.insert(auditLog).values({
        entity: "backoffice_lockout",
        entityId: lockout.id,
        actorId: null,
        previousValue: null,
        newValue: {
          sourceAddressHash: hashSourceAddress(sourceAddress),
          failureCount: lockout.failureCount,
          blockedUntil: lockout.blockedUntil.toISOString(),
        },
      });
    } catch (error) {
      reportError(error);
    }
  }

  app.post("/sessions", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
    const startedAt = performance.now();
    if (!requireBackofficeOrigin(request, reply, options.backofficeOrigin)) {
      return;
    }

    // Checked before anything is recorded, so a request with nothing to verify never takes a lockout slot.
    const body = sessionAuthenticationBodySchema.safeParse(request.body);
    if (!body.success) {
      await rejectAuthentication(reply, startedAt);
      return;
    }
    const assertion = body.data.assertion as AuthenticationResponseJSON;
    const challenge = readAssertionChallenge(assertion);
    if (challenge === undefined) {
      await rejectAuthentication(reply, startedAt);
      return;
    }

    const sourceAddress = resolveSourceAddress(request);
    const attemptedAt = now();
    const admission = await admitSignInAttempt(options.db, { sourceAddress, now: attemptedAt });
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
    const challengeIsLive = await consumeSignInChallenge(options.db, {
      challenge,
      now: attemptedAt,
    });

    const found = await findSignInPasskey(
      { accounts: drizzleAccounts(options.db) },
      { credentialId: assertion.id },
    );
    if (found.kind === "unknown") {
      await rejectSignInAttempt(
        sourceAddress,
        attemptedAt,
        reply,
        startedAt,
        UNKNOWN_PASSKEY_RESPONSE,
      );
      return;
    }
    if (found.kind === "inactive") {
      await rejectSignInAttempt(sourceAddress, attemptedAt, reply, startedAt);
      return;
    }
    const { passkey } = found;

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: () => challengeIsLive,
      expectedOrigin: webAuthnConfig.expectedOrigin,
      expectedRPID: webAuthnConfig.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.counter,
        ...(passkey.transports ? { transports: passkey.transports } : {}),
      },
      requireUserVerification: true,
    }).catch(() => ({ verified: false as const }));
    if (!verification.verified) {
      await rejectSignInAttempt(sourceAddress, attemptedAt, reply, startedAt);
      return;
    }
    const { authenticationInfo } = verification;

    // WebAuthn clone signal: once the counter has left zero, a non-increasing counter means a cloned authenticator.
    const isCloneSignal = passkey.counter > 0 && authenticationInfo.newCounter <= passkey.counter;
    if (isCloneSignal) {
      await rejectSignInAttempt(sourceAddress, attemptedAt, reply, startedAt);
      return;
    }

    // One transaction, so a failed write can never leave behind a live session whose cookie nobody ever received.
    const previousRawSessionId = readSessionCookie(request.headers.cookie);
    const rawSessionId = generateSessionId();
    const opened = await options.db.transaction(async (tx) => {
      // Locks the passkey's row before any session exists, so a concurrent removal leaves nothing
      // to update here and no session opens for a passkey removed in the meantime.
      const [usedPasskey] = await tx
        .update(passkeys)
        .set({
          lastUsedAt: attemptedAt,
          ...(authenticationInfo.newCounter !== passkey.counter
            ? { counter: authenticationInfo.newCounter }
            : {}),
        })
        .where(eq(passkeys.id, passkey.id))
        .returning({ id: passkeys.id });
      if (!usedPasskey) {
        return false;
      }

      if (previousRawSessionId) {
        await tx
          .update(sessions)
          .set({ revokedAt: attemptedAt })
          .where(eq(sessions.sessionIdHash, hashSessionId(previousRawSessionId)));
      }

      await tx.insert(sessions).values({
        userId: passkey.userId,
        sessionIdHash: hashSessionId(rawSessionId),
        createdAt: attemptedAt,
        lastSeenAt: attemptedAt,
        passkeyAuthorizedAt: attemptedAt,
      });

      await discardSignInAttempt(tx, admission.attemptId);
      return true;
    });
    if (!opened) {
      await rejectSignInAttempt(sourceAddress, attemptedAt, reply, startedAt);
      return;
    }

    await reply.header("Set-Cookie", serializeSessionCookie(rawSessionId)).code(200).send();
  });
}
