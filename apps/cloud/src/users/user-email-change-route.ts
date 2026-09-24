import { and, eq, isNull } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, recoveryTokens, users } from "../db/schema.js";
import { requireOpenSession } from "../session/open-session.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";
import { findBranchUser, toBranchUserWire } from "./branch-users.js";
import { readEmail } from "./email-validation.js";
import { FORBIDDEN_RESPONSE } from "./forbidden-response.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const UNIQUE_VIOLATION = "23505";
const EMAIL_UNIQUE_INDEX = "users_email_key";

/**
 * Walks the driver error (wrapped by Drizzle as its `cause`) for a unique violation on
 * `users.email`. postgres-js, the production driver, names the index `constraint_name`; PGlite,
 * which the unit tests run on, names it `constraint`.
 */
function isEmailUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    const index = constraint_name ?? constraint;
    if (code === UNIQUE_VIOLATION && index === EMAIL_UNIQUE_INDEX) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

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
 * Registers `POST /users/:id/email`: changes another branch user's email, gated by the shared
 * passkey-authorization window (`passkey-authorization-guard.ts`) instead of its own per-action
 * step-up. Checks the target belongs to the session's own branch before doing anything else.
 */
export function registerUserEmailChangeRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());

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

    if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
      return;
    }

    const outcome = await options.db
      .transaction<EmailChangeOutcome>(async (tx) => {
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

        // The unique index on `users.email` decides whether the address is taken: a read before
        // this write could miss another request writing the same address concurrently.
        const nextVersion = current.version + 1;
        await tx
          .update(users)
          .set({ email: parsedBody.email, version: nextVersion })
          .where(eq(users.id, target.id));

        // A recovery link already sent to the previous address must not outlive the change.
        await tx
          .update(recoveryTokens)
          .set({ voidedAt: attemptedAt })
          .where(
            and(
              eq(recoveryTokens.userId, target.id),
              isNull(recoveryTokens.usedAt),
              isNull(recoveryTokens.voidedAt),
            ),
          );

        await tx.insert(auditLog).values({
          entity: "user",
          entityId: target.id,
          actorId: openSession.userId,
          previousValue: { email: current.email },
          newValue: { email: parsedBody.email },
        });

        return { kind: "applied", email: parsedBody.email, version: nextVersion };
      })
      .catch((error: unknown): EmailChangeOutcome => {
        if (isEmailUniqueViolation(error)) {
          return { kind: "email_taken" };
        }
        throw error;
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
