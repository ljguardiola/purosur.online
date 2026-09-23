import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys } from "../db/schema.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import {
  checkBackofficeRateLimit,
  resolveOpenSession,
  UNAUTHENTICATED_RESPONSE,
} from "../session/open-session.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "./passkey-challenge.js";
import { verifyPasskeyReauthentication } from "./passkey-reauthentication.js";

export interface PasskeyRemovalRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the issued challenge's stored lifetime and audited timestamps are deterministic. */
  now?: () => Date;
}

const AUTHENTICATION_TIMEOUT_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same uniform code and message the registration route rejects a bad reauthentication with.
const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey reauthentication could not be verified",
} as const;

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no passkey with that id belongs to this account",
} as const;

function readAssertion(body: unknown): AuthenticationResponseJSON | undefined {
  const assertion = (body as { reauthentication?: unknown } | undefined)?.reauthentication as
    | AuthenticationResponseJSON
    | undefined;
  return assertion && typeof assertion.id === "string" ? assertion : undefined;
}

/**
 * Registers the two endpoints that remove a passkey from an already-open session's account (issue
 * #169): `removal-options` hands back a reauthentication challenge against the account's existing
 * passkeys, and `POST /users/passkeys/:id/remove` verifies it before deleting the named passkey —
 * which may be the very one that reauthenticated. Neither ever revokes the session, and removing
 * the account's only remaining passkey is allowed.
 */
export function registerPasskeyRemovalRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeyRemovalRouteOptions<TQueryResult>,
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

  app.post("/users/passkeys/removal-options", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const issuedAt = now();
    if (!(await checkBackofficeRateLimit(request, reply, { db: options.db, now: issuedAt }))) {
      return;
    }
    const openSession = await resolveOpenSession(request, { db: options.db, now: issuedAt });
    if (!openSession) {
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }

    const existingPasskeys = await options.db
      .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
      .from(passkeys)
      .where(eq(passkeys.userId, openSession.userId));

    const reauthenticationOptions = await generateAuthenticationOptions({
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
      kind: "removal",
      reauthenticationChallenge: reauthenticationOptions.challenge,
      now: issuedAt,
    });

    await reply.code(200).send({ reauthentication_options: reauthenticationOptions });
  });

  app.post("/users/passkeys/:id/remove", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const attemptedAt = now();
    if (!(await checkBackofficeRateLimit(request, reply, { db: options.db, now: attemptedAt }))) {
      return;
    }
    const openSession = await resolveOpenSession(request, { db: options.db, now: attemptedAt });
    if (!openSession) {
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }

    const targetId = (request.params as { id: string }).id;
    if (!UUID_PATTERN.test(targetId)) {
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }

    const assertion = readAssertion(request.body);
    if (!assertion) {
      await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
      return;
    }

    const pending = await consumePendingPasskeyChallenge(options.db, {
      sessionId: openSession.sessionId,
      now: attemptedAt,
    });
    if (pending?.kind !== "removal") {
      await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
      return;
    }

    const reauthentication = await verifyPasskeyReauthentication(options.db, {
      userId: openSession.userId,
      assertion,
      expectedChallenge: pending.reauthenticationChallenge,
      webAuthnConfig,
      now: attemptedAt,
    });
    if (!reauthentication.verified) {
      await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
      return;
    }

    const [target] = await options.db
      .select({ id: passkeys.id, name: passkeys.name })
      .from(passkeys)
      .where(and(eq(passkeys.id, targetId), eq(passkeys.userId, openSession.userId)))
      .limit(1);
    if (!target) {
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }

    await options.db.transaction(async (tx) => {
      await tx.delete(passkeys).where(eq(passkeys.id, target.id));
      await tx.insert(auditLog).values({
        entity: "passkey",
        entityId: target.id,
        actorId: openSession.userId,
        previousValue: { id: target.id, name: target.name },
        newValue: null,
      });
    });

    await reply.code(200).send();
  });
}
