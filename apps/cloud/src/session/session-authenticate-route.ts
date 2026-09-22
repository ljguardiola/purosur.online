import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, sessions } from "../db/schema.js";
import { reportRecoveryBookkeepingError } from "../recovery/recovery-error-reporting.js";
import { resolveSourceAddress } from "../recovery/recovery-source-address.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { readSessionCookie, serializeSessionCookie } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { consumeSignInChallenge } from "./sign-in-challenge.js";
import { checkSignInLockout, hashSourceAddress, recordSignInFailure } from "./sign-in-lockout.js";

export interface SessionAuthenticateRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the rolling lockout window and the audited timestamps are deterministic. */
  now?: () => Date;
  /** Injected in tests to keep the uniform-failure timing floor from slowing the suite down. */
  delay?: (ms: number) => Promise<void>;
  /** Injected in tests to prove a bookkeeping failure never turns the response into a 500. */
  recordSignInFailure?: typeof recordSignInFailure;
  /** Injected in tests; defaults to logging and reporting to Sentry. */
  reportError?: (error: unknown) => void;
}

// Every rejection reason (unknown credential, bad signature, stale challenge, clone-signal
// counter) answers with this same code and message: nothing about the response may let someone
// infer which accounts or credentials are registered.
const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey could not be verified",
} as const;

// Floors every rejection's response time to roughly the same duration, so a fast rejection (an
// unknown credential, resolved by one indexed lookup) does not visibly answer faster than a slow
// one (a bad signature, resolved only after a full verification pass).
const FAILURE_RESPONSE_FLOOR_MS = 200;

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Registers `POST /users/session/authenticate`: resolves the account from a discoverable WebAuthn
 * assertion, verifies it, and opens a server-side session on success. Checks the per-source-address
 * lockout before ever looking up a credential, so a blocked address never learns whether the
 * credential it sent would otherwise have worked.
 */
export function registerSessionAuthenticateRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionAuthenticateRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const delay = options.delay ?? defaultDelay;
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);
  const doRecordSignInFailure = options.recordSignInFailure ?? recordSignInFailure;
  const reportError = options.reportError ?? reportRecoveryBookkeepingError;

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  async function rejectAuthentication(
    request: FastifyRequest,
    reply: FastifyReply,
    startedAt: number,
  ): Promise<void> {
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs < FAILURE_RESPONSE_FLOOR_MS) {
      await delay(FAILURE_RESPONSE_FLOOR_MS - elapsedMs);
    }

    const sourceAddress = resolveSourceAddress(request);
    const attemptedAt = now();
    const result = await doRecordSignInFailure(options.db, { sourceAddress, now: attemptedAt });
    if (result.tripped) {
      // A bookkeeping failure here must never turn this 401 into a 500.
      try {
        await options.db.insert(auditLog).values({
          entity: "backoffice_lockout",
          entityId: result.lockout.id,
          actorId: null,
          previousValue: null,
          newValue: {
            sourceAddressHash: hashSourceAddress(sourceAddress),
            failureCount: result.lockout.failureCount,
            blockedUntil: result.lockout.blockedUntil.toISOString(),
          },
        });
      } catch (error) {
        reportError(error);
      }
    }

    await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
  }

  app.post("/users/session/authenticate", async (request, reply) => {
    const startedAt = performance.now();
    if (!checkOrigin(request, reply)) {
      return;
    }

    const sourceAddress = resolveSourceAddress(request);
    const attemptedAt = now();
    const lockout = await checkSignInLockout(options.db, sourceAddress, attemptedAt);
    if (lockout.blocked) {
      const retryAfterSeconds = Math.ceil(
        (lockout.blockedUntil.getTime() - attemptedAt.getTime()) / 1000,
      );
      await reply
        .header("Retry-After", String(retryAfterSeconds))
        .code(429)
        .send({ code: "rate_limited", message: "too many sign-in attempts" });
      return;
    }

    const assertion = (request.body as { assertion?: unknown } | undefined)?.assertion as
      | AuthenticationResponseJSON
      | undefined;
    if (!assertion || typeof assertion.id !== "string") {
      await rejectAuthentication(request, reply, startedAt);
      return;
    }

    const [passkey] = await options.db
      .select({
        id: passkeys.id,
        userId: passkeys.userId,
        credentialId: passkeys.credentialId,
        publicKey: passkeys.publicKey,
        counter: passkeys.counter,
        transports: passkeys.transports,
      })
      .from(passkeys)
      .where(eq(passkeys.credentialId, assertion.id))
      .limit(1);
    if (!passkey) {
      await rejectAuthentication(request, reply, startedAt);
      return;
    }

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: (challenge) =>
        consumeSignInChallenge(options.db, { challenge, now: attemptedAt }),
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
      await rejectAuthentication(request, reply, startedAt);
      return;
    }
    const { authenticationInfo } = verification;

    // An authenticator's counter is optional; many platform authenticators always report 0. Once
    // it has ever been non-zero, an assertion whose counter does not exceed the stored one is a
    // clone signal and is rejected like any other failed attempt.
    const isCloneSignal = passkey.counter > 0 && authenticationInfo.newCounter <= passkey.counter;
    if (isCloneSignal) {
      await rejectAuthentication(request, reply, startedAt);
      return;
    }

    // Sign-in always ends whatever session cookie arrived and issues a brand-new id, whether or
    // not that previous session even belonged to this account.
    const previousRawSessionId = readSessionCookie(request.headers.cookie);
    if (previousRawSessionId) {
      await options.db
        .update(sessions)
        .set({ revokedAt: attemptedAt })
        .where(eq(sessions.sessionIdHash, hashSessionId(previousRawSessionId)));
    }

    const rawSessionId = generateSessionId();
    await options.db.insert(sessions).values({
      userId: passkey.userId,
      sessionIdHash: hashSessionId(rawSessionId),
      createdAt: attemptedAt,
      lastSeenAt: attemptedAt,
    });
    if (authenticationInfo.newCounter !== passkey.counter) {
      await options.db
        .update(passkeys)
        .set({ counter: authenticationInfo.newCounter })
        .where(eq(passkeys.id, passkey.id));
    }

    await reply.header("Set-Cookie", serializeSessionCookie(rawSessionId)).code(200).send();
  });
}
