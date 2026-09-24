import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { and, eq, isNull } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, sessions } from "../db/schema.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "../passkeys/passkey-challenge.js";
import { verifyPasskeyReauthentication } from "../passkeys/passkey-reauthentication.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { requireOpenSession } from "../session/open-session.js";
import { findBranchUser } from "./branch-users.js";
import { FORBIDDEN_RESPONSE } from "./forbidden-response.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const AUTHENTICATION_TIMEOUT_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same uniform code and message the other passkey step-up routes reject a bad reauthentication
// with.
const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey reauthentication could not be verified",
} as const;

// Same shape (and same "malformed/missing/other-branch are indistinguishable" reasoning)
// `user-read-route.ts` answers with.
const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

// Same uniform code `passkeys-removal-route.ts` answers with for an id that doesn't belong to the
// acting account; here "the acting account" is the target user, never the Administrator's own.
const PASSKEY_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no passkey with that id belongs to this user",
} as const;

// An Administrator removes their own passkeys from Mi cuenta (which never ends their own
// session), never from this route.
const OWN_ACCOUNT_RESPONSE = {
  code: "own_account",
  message: "use Mi cuenta to manage your own passkeys",
} as const;

function readAssertion(body: unknown): AuthenticationResponseJSON | undefined {
  const assertion = (body as { reauthentication?: unknown } | undefined)?.reauthentication as
    | AuthenticationResponseJSON
    | undefined;
  return assertion && typeof assertion.id === "string" ? assertion : undefined;
}

/**
 * Registers the two endpoints that let an Administrator remove another branch user's passkey,
 * behind the same fresh-reauthentication step-up `user-email-change-route.ts` uses:
 * `removal-options` hands back a reauthentication challenge against the Administrator's own
 * existing passkeys (never the target's), and `POST /users/:id/passkeys/:passkeyId/remove`
 * verifies it before deleting the target's named passkey. Both routes check the target belongs to
 * the session's own branch before doing anything else (identical 404 for a malformed, missing, or
 * other-branch id, matching `user-read-route.ts`), and reject the session's own user as a target
 * (that self-service lives in Mi cuenta, which never ends the acting session). Unlike self-removal,
 * a successful removal here ends every backoffice session already open on the target's account
 * and audits the target's id alongside the removed passkey.
 */
export function registerUserPasskeyRemovalRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
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

  /** Folds a malformed id into the same 404 a missing or another branch's id gets. */
  async function findTarget(locationId: string, targetId: string) {
    if (!UUID_PATTERN.test(targetId)) {
      return undefined;
    }
    return findBranchUser(options.db, locationId, targetId);
  }

  app.post<{ Params: { id: string } }>(
    "/users/:id/passkeys/removal-options",
    async (request, reply) => {
      if (!checkOrigin(request, reply)) {
        return;
      }
      const issuedAt = now();
      const openSession = await requireOpenSession(request, reply, {
        db: options.db,
        now: issuedAt,
      });
      if (!openSession) {
        return;
      }
      if (!openSession.isAdministrator) {
        await reply.code(403).send(FORBIDDEN_RESPONSE);
        return;
      }

      const target = await findTarget(openSession.locationId, request.params.id);
      if (!target) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }
      if (target.id === openSession.userId) {
        await reply.code(403).send(OWN_ACCOUNT_RESPONSE);
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
        kind: "user_passkey_removal",
        reauthenticationChallenge: reauthenticationOptions.challenge,
        now: issuedAt,
      });

      await reply.code(200).send({ reauthentication_options: reauthenticationOptions });
    },
  );

  app.post<{ Params: { id: string; passkeyId: string } }>(
    "/users/:id/passkeys/:passkeyId/remove",
    async (request, reply) => {
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
      if (!openSession.isAdministrator) {
        await reply.code(403).send(FORBIDDEN_RESPONSE);
        return;
      }

      const target = await findTarget(openSession.locationId, request.params.id);
      if (!target) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }
      if (target.id === openSession.userId) {
        await reply.code(403).send(OWN_ACCOUNT_RESPONSE);
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
      if (pending?.kind !== "user_passkey_removal") {
        await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
        return;
      }

      // Reauthenticates the Administrator, the one holding the session: never the target, who
      // never proves anything in this flow.
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

      const passkeyId = request.params.passkeyId;
      if (!UUID_PATTERN.test(passkeyId)) {
        await reply.code(404).send(PASSKEY_NOT_FOUND_RESPONSE);
        return;
      }

      const removed = await options.db.transaction(async (tx) => {
        // Deleting first takes the passkey's row lock before anything else: a concurrent removal
        // of the same passkey then deletes nothing and answers not_found, and a sign-in with it
        // that got the lock first has committed its session before the sessions below are ended.
        const [removedPasskey] = await tx
          .delete(passkeys)
          .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, target.id)))
          .returning({ id: passkeys.id, name: passkeys.name });
        if (!removedPasskey) {
          return undefined;
        }

        // A session already open on a lost device must not outlive its passkey, so every session
        // of the target ends here, the same way a redeemed recovery link ends every session on the
        // account (`recovery-redemption-route.ts`). Self-removal from Mi cuenta never does this.
        await tx
          .update(sessions)
          .set({ revokedAt: attemptedAt })
          .where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt)));

        await tx.insert(auditLog).values({
          entity: "passkey",
          entityId: removedPasskey.id,
          actorId: openSession.userId,
          previousValue: { id: removedPasskey.id, name: removedPasskey.name, userId: target.id },
          newValue: null,
        });
        return removedPasskey;
      });
      if (!removed) {
        await reply.code(404).send(PASSKEY_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
