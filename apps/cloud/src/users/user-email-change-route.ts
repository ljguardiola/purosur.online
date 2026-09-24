import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { and, eq, ne } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, users } from "../db/schema.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "../passkeys/passkey-challenge.js";
import { verifyPasskeyReauthentication } from "../passkeys/passkey-reauthentication.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { requireOpenSession } from "../session/open-session.js";
import { findBranchUser, toBranchUserWire } from "./branch-users.js";
import { readEmail } from "./email-validation.js";
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
// `user-read-route.ts` answers with; both this route and its options route check the target
// against the session's own branch before doing anything else, so an outsider never learns the id
// exists by getting a different response from one route than the other.
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

const EMAIL_TAKEN_RESPONSE = {
  code: "email_taken",
  message: "a user with that email already exists",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this user was changed since it was loaded",
} as const;

interface ValidationFailure {
  field: "email" | "version";
  message: string;
}

interface EmailChangeRequestBody {
  email: string;
  version: number;
}

function readVersion(body: unknown): number | undefined {
  const raw = (body as { version?: unknown } | undefined)?.version;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : undefined;
}

function readAssertion(body: unknown): AuthenticationResponseJSON | undefined {
  const assertion = (body as { reauthentication?: unknown } | undefined)?.reauthentication as
    | AuthenticationResponseJSON
    | undefined;
  return assertion && typeof assertion.id === "string" ? assertion : undefined;
}

function readEmailChangeBody(body: unknown): EmailChangeRequestBody | ValidationFailure {
  const email = readEmail(body);
  if (!email) {
    return { field: "email", message: "email must look like local@domain" };
  }
  const version = readVersion(body);
  if (version === undefined) {
    return { field: "version", message: "version must be the positive integer it was loaded with" };
  }
  return { email, version };
}

function isValidationFailure(
  value: EmailChangeRequestBody | ValidationFailure,
): value is ValidationFailure {
  return "field" in value;
}

type EmailChangeOutcome =
  | { kind: "stale_version" }
  | { kind: "email_taken" }
  | { kind: "applied"; email: string; version: number };

/**
 * Registers the two endpoints that let an Administrator change another branch user's email,
 * behind the same fresh-reauthentication step-up `user-creation-route.ts` uses:
 * `email-change-options` hands back a reauthentication challenge against the Administrator's own
 * existing passkeys (never the target user's), and `POST /users/:id/email` verifies it before
 * writing the change. Both routes check the target belongs to the session's own branch before
 * doing anything else, so an id from another branch answers identically to a missing one from
 * either route.
 */
export function registerUserEmailChangeRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);

  /** A malformed id would otherwise reach the database as an invalid uuid input error (500); this
   * folds it into the same 404 a missing or another branch's id gets, matching `user-read-route.ts`. */
  async function findTarget(locationId: string, targetId: string) {
    if (!UUID_PATTERN.test(targetId)) {
      return undefined;
    }
    return findBranchUser(options.db, locationId, targetId);
  }

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

  app.post<{ Params: { id: string } }>(
    "/users/:id/email-change-options",
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
        await reply.code(404).send(NOT_FOUND_RESPONSE);
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
        kind: "user_email_change",
        reauthenticationChallenge: reauthenticationOptions.challenge,
        now: issuedAt,
      });

      await reply.code(200).send({ reauthentication_options: reauthenticationOptions });
    },
  );

  app.post<{ Params: { id: string } }>("/users/:id/email", async (request, reply) => {
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
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }

    const parsedBody = readEmailChangeBody(request.body);
    if (isValidationFailure(parsedBody)) {
      await reply.code(400).send({
        code: "validation_failed",
        message: parsedBody.message,
        details: [{ field: parsedBody.field }],
      });
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
    if (pending?.kind !== "user_email_change") {
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

    const outcome = await options.db.transaction<EmailChangeOutcome>(async (tx) => {
      // Locks this one row so a concurrent request against the same user waits instead of
      // racing: the version check below and the write it may lead to happen against a value that
      // cannot change out from under this transaction while it holds the lock.
      const [current] = await tx
        .select({ email: users.email, version: users.version })
        .from(users)
        .where(eq(users.id, target.id))
        .for("update");
      if (!current) {
        // The branch check above already confirmed this id exists; nothing in this codebase
        // deletes a user, so this is unreachable in practice.
        return { kind: "stale_version" };
      }
      if (current.version !== parsedBody.version) {
        return { kind: "stale_version" };
      }
      if (current.email === parsedBody.email) {
        return { kind: "applied", email: current.email, version: current.version };
      }

      const alreadyTaken = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, parsedBody.email), ne(users.id, target.id)))
        .limit(1);
      if (alreadyTaken.length > 0) {
        return { kind: "email_taken" };
      }

      const nextVersion = current.version + 1;
      await tx
        .update(users)
        .set({ email: parsedBody.email, version: nextVersion })
        .where(eq(users.id, target.id));

      await tx.insert(auditLog).values({
        entity: "user",
        entityId: target.id,
        actorId: openSession.userId,
        previousValue: { email: current.email },
        newValue: { email: parsedBody.email },
      });

      return { kind: "applied", email: parsedBody.email, version: nextVersion };
    });

    if (outcome.kind === "stale_version") {
      await reply.code(409).send(STALE_VERSION_RESPONSE);
      return;
    }
    if (outcome.kind === "email_taken") {
      await reply.code(409).send(EMAIL_TAKEN_RESPONSE);
      return;
    }

    await reply.code(200).send(
      toBranchUserWire({
        ...target,
        email: outcome.email,
        version: outcome.version,
      }),
    );
  });
}
