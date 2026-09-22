import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, sessions, users } from "../db/schema.js";
import { reportRecoveryBookkeepingError } from "../recovery/recovery-error-reporting.js";
import { resolveSourceAddress } from "../recovery/recovery-source-address.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { readSessionCookie, serializeSessionCookie } from "./session-cookie.js";
import { generateSessionId, hashSessionId } from "./session-id.js";
import { consumeSignInChallenge } from "./sign-in-challenge.js";
import {
  admitSignInAttempt,
  discardSignInAttempt,
  hashSourceAddress,
  type TrippedSignInLockout,
} from "./sign-in-lockout.js";

export interface SessionAuthenticateRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the rolling lockout window and the audited timestamps are deterministic. */
  now?: () => Date;
  /** Injected in tests to keep the uniform-failure timing floor from slowing the suite down. */
  delay?: (ms: number) => Promise<void>;
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

/** The challenge the authenticator signed over, read from the assertion's own client data. */
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

  /** The attempt stays counted against its source address: it is a rejected sign-in. */
  async function rejectAuthentication(reply: FastifyReply, startedAt: number): Promise<void> {
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs < FAILURE_RESPONSE_FLOOR_MS) {
      await delay(FAILURE_RESPONSE_FLOOR_MS - elapsedMs);
    }

    await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
  }

  /**
   * A body with nothing to verify in it never reaches the credential check, so it is not a
   * rejected sign-in attempt and gives its slot of the address's lockout budget back.
   */
  async function rejectUnverifiableRequest(
    attemptId: string,
    reply: FastifyReply,
    startedAt: number,
  ): Promise<void> {
    await discardSignInAttempt(options.db, attemptId);
    await rejectAuthentication(reply, startedAt);
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

  app.post("/users/session/authenticate", async (request, reply) => {
    const startedAt = performance.now();
    if (!checkOrigin(request, reply)) {
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

    const assertion = (request.body as { assertion?: unknown } | undefined)?.assertion as
      | AuthenticationResponseJSON
      | undefined;
    if (!assertion || typeof assertion.id !== "string") {
      await rejectUnverifiableRequest(admission.attemptId, reply, startedAt);
      return;
    }
    const challenge = readAssertionChallenge(assertion);
    if (challenge === undefined) {
      await rejectUnverifiableRequest(admission.attemptId, reply, startedAt);
      return;
    }

    // Spent before the credential is even looked up, so an assertion naming a registered
    // credential id and one naming an unregistered id leave exactly the same behind: whether a
    // challenge survives a rejection must not tell anyone which credentials exist.
    const challengeIsLive = await consumeSignInChallenge(options.db, {
      challenge,
      now: attemptedAt,
    });

    const [passkey] = await options.db
      .select({
        id: passkeys.id,
        userId: passkeys.userId,
        credentialId: passkeys.credentialId,
        publicKey: passkeys.publicKey,
        counter: passkeys.counter,
        transports: passkeys.transports,
        active: users.active,
      })
      .from(passkeys)
      .innerJoin(users, eq(users.id, passkeys.userId))
      .where(eq(passkeys.credentialId, assertion.id))
      .limit(1);
    if (!passkey) {
      await rejectAuthentication(reply, startedAt);
      return;
    }
    // A deactivated account's session ends immediately (drafts/docs/puro-sur-pos.md §12.3,
    // CA-ACC-19); the same rule blocks it from ever opening a new one. The rejection must not be
    // distinguishable from an unknown credential, so it never runs signature verification either.
    if (!passkey.active) {
      await rejectAuthentication(reply, startedAt);
      return;
    }

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
      await rejectAuthentication(reply, startedAt);
      return;
    }
    const { authenticationInfo } = verification;

    // An authenticator's counter is optional; many platform authenticators always report 0. Once
    // it has ever been non-zero, an assertion whose counter does not exceed the stored one is a
    // clone signal and is rejected like any other failed attempt.
    const isCloneSignal = passkey.counter > 0 && authenticationInfo.newCounter <= passkey.counter;
    if (isCloneSignal) {
      await rejectAuthentication(reply, startedAt);
      return;
    }

    // Sign-in always ends whatever session cookie arrived and issues a brand-new id, whether or
    // not that previous session even belonged to this account. All of it in one transaction, so a
    // failed write can never leave behind a live session whose cookie nobody ever received.
    const previousRawSessionId = readSessionCookie(request.headers.cookie);
    const rawSessionId = generateSessionId();
    await options.db.transaction(async (tx) => {
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
      });

      if (authenticationInfo.newCounter !== passkey.counter) {
        await tx
          .update(passkeys)
          .set({ counter: authenticationInfo.newCounter })
          .where(eq(passkeys.id, passkey.id));
      }

      // This attempt was no rejected sign-in, so it gives its slot of the address's lockout
      // budget back: only server-rejected attempts count toward the block.
      await discardSignInAttempt(tx, admission.attemptId);
    });

    await reply.header("Set-Cookie", serializeSessionCookie(rawSessionId)).code(200).send();
  });
}
