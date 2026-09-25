import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { passkeys, sessions } from "../db/schema.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "../passkeys/passkey-challenge.js";
import { verifyPasskeyReauthentication } from "../passkeys/passkey-reauthentication.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { requireOpenSession } from "./open-session.js";

export interface SessionAuthorizationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the issued challenge's stored lifetime and the authorized-at timestamp are deterministic. */
  now?: () => Date;
}

const AUTHENTICATION_TIMEOUT_MS = 60_000;

// Same uniform code and message the other passkey verification routes reject a bad assertion
// with.
const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey authorization could not be verified",
} as const;

function readAssertion(body: unknown): AuthenticationResponseJSON | undefined {
  const assertion = (body as { authorization?: unknown } | undefined)?.authorization as
    | AuthenticationResponseJSON
    | undefined;
  return assertion && typeof assertion.id === "string" ? assertion : undefined;
}

/**
 * Registers the pair behind the shared passkey-authorization window (`passkey-authorization-guard.ts`):
 * `authorization-options` hands back an assertion challenge against the session's own account's
 * passkeys, and `POST /users/session/authorization` verifies it and sets
 * `sessions.passkey_authorized_at` to the moment it succeeds, opening (or refreshing) the 5-minute
 * window every sensitive backoffice action is gated by. Neither route is itself gated by that
 * window: an already-open session can always ask to (re)authorize.
 */
export function registerSessionAuthorizationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionAuthorizationRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);

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

  app.post("/users/session/authorization-options", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const issuedAt = now();
    const openSession = await requireOpenSession(request, reply, { db: options.db, now: issuedAt });
    if (!openSession) {
      return;
    }

    const existingPasskeys = await options.db
      .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
      .from(passkeys)
      .where(eq(passkeys.userId, openSession.userId));

    const authorizationOptions = await generateAuthenticationOptions({
      rpID: webAuthnConfig.rpID,
      allowCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.credentialId,
        ...(passkey.transports ? { transports: passkey.transports } : {}),
      })),
      userVerification: "required",
      timeout: AUTHENTICATION_TIMEOUT_MS,
    });

    await pruneExpiredPasskeyChallenges(options.db, issuedAt);
    await storePendingPasskeyChallenge(options.db, {
      sessionId: openSession.sessionId,
      kind: "session_authorization",
      reauthenticationChallenge: authorizationOptions.challenge,
      now: issuedAt,
    });

    await reply.code(200).send({ authorization_options: authorizationOptions });
  });

  app.post("/users/session/authorization", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const attemptedAt = now();
    const openSession = await requireOpenSession(request, reply, {
      db: options.db,
      now: attemptedAt,
    });
    if (!openSession) {
      return;
    }

    const assertion = readAssertion(request.body);
    if (!assertion) {
      await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
      return;
    }

    const pending = await consumePendingPasskeyChallenge(options.db, {
      sessionId: openSession.sessionId,
      kind: "session_authorization",
      now: attemptedAt,
    });
    if (!pending?.reauthenticationChallenge) {
      await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
      return;
    }

    const authorization = await verifyPasskeyReauthentication(options.db, {
      userId: openSession.userId,
      assertion,
      expectedChallenge: pending.reauthenticationChallenge,
      webAuthnConfig,
      now: attemptedAt,
    });
    if (!authorization.verified) {
      await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
      return;
    }

    await options.db
      .update(sessions)
      .set({ passkeyAuthorizedAt: attemptedAt })
      .where(eq(sessions.id, openSession.sessionId));

    await reply.code(200).send();
  });
}
