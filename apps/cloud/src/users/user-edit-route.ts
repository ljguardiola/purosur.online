import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, recoveryTokens, roles, userRoles, users } from "../db/schema.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { findBranchUser, toBranchUserWire } from "./branch-users.js";
import { readEmail } from "./email-validation.js";
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

const UNKNOWN_ROLE_RESPONSE = {
  code: "validation_failed",
  message: "role_id must be an existing role's id",
  details: [{ field: "role_id" }],
} as const;

const LAST_ADMINISTRATOR_RESPONSE = {
  code: "last_administrator",
  message: "the only active Administrator can't have their role changed away from it",
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
  field: "email" | "role_id" | "version";
  message: string;
}

interface EditRequestBody {
  email: string;
  roleId: string;
  version: number;
}

function readVersion(body: unknown): number | undefined {
  const raw = (body as { version?: unknown } | undefined)?.version;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : undefined;
}

function readRoleId(body: unknown): string | undefined {
  const raw = (body as { role_id?: unknown } | undefined)?.role_id;
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

function readEditBody(body: unknown): EditRequestBody | ValidationFailure {
  const email = readEmail(body);
  if (!email) {
    return { field: "email", message: "email must look like local@domain" };
  }
  const roleId = readRoleId(body);
  if (!roleId) {
    return { field: "role_id", message: "role_id must be a role's id" };
  }
  const version = readVersion(body);
  if (version === undefined) {
    return { field: "version", message: "version must be the positive integer it was loaded with" };
  }
  return { email, roleId, version };
}

function isValidationFailure(
  value: EditRequestBody | ValidationFailure,
): value is ValidationFailure {
  return "field" in value;
}

type EditOutcome =
  | { kind: "stale_version" }
  | { kind: "email_taken" }
  | { kind: "last_administrator" }
  | { kind: "applied" };

/**
 * Registers `POST /users/:id/edit`: changes another branch user's email and role together, in one
 * transaction with a single `users.version` bump, gated by the shared passkey-authorization window
 * (`passkey-authorization-guard.ts`) instead of its own per-action step-up. Replaces the old
 * `POST /users/:id/email` (two sequential requests, one per field, could conflict on `version` and
 * half-apply). Checks the target belongs to the session's own branch before doing anything else.
 */
export function registerUserEditRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

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
    "/users/:id/edit",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const target = await findTarget(openSession.locationId, request.params.id);
      if (!target) {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      const parsedBody = readEditBody(request.body);
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

      const [requestedRole] = await options.db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.id, parsedBody.roleId))
        .limit(1);
      if (!requestedRole) {
        await reply.code(400).send(UNKNOWN_ROLE_RESPONSE);
        return;
      }

      const outcome = await options.db
        .transaction<EditOutcome>(async (tx) => {
          // Locks the single Administrator role row before counting its active holders, so two
          // concurrent role changes that could each leave the business without an active
          // Administrator serialize on it instead of both reading "not the last one" and both
          // succeeding (see the "user-role-change-concurrency" integration test).
          const [administratorRole] = await tx
            .select({ id: roles.id })
            .from(roles)
            .where(eq(roles.isAdministrator, true))
            .for("update");
          if (!administratorRole) {
            // The migration seeds the single Administrator role; nothing in this codebase removes
            // it, so this is unreachable in practice.
            return { kind: "stale_version" };
          }

          // Locks this one user row so a concurrent edit against the same user waits instead of
          // racing: the version check below and the write it may lead to happen against a value
          // that cannot change out from under this transaction while it holds the lock.
          const [currentUser] = await tx
            .select({ email: users.email, version: users.version })
            .from(users)
            .where(eq(users.id, target.id))
            .for("update");
          if (!currentUser || currentUser.version !== parsedBody.version) {
            return { kind: "stale_version" };
          }

          const [currentUserRole] = await tx
            .select({ roleId: userRoles.roleId })
            .from(userRoles)
            .where(eq(userRoles.userId, target.id));
          if (!currentUserRole) {
            // The branch check above already confirmed this user has a role; nothing in this
            // codebase removes a user's `user_roles` row, so this is unreachable in practice.
            return { kind: "stale_version" };
          }

          const [administratorCount] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .innerJoin(userRoles, eq(userRoles.userId, users.id))
            .where(
              and(
                eq(users.locationId, openSession.locationId),
                eq(users.active, true),
                eq(userRoles.roleId, administratorRole.id),
              ),
            );
          const activeAdministratorCount = administratorCount?.count ?? 0;

          const isLastActiveAdministrator =
            currentUserRole.roleId === administratorRole.id && activeAdministratorCount === 1;
          if (isLastActiveAdministrator && requestedRole.id !== administratorRole.id) {
            return { kind: "last_administrator" };
          }

          const emailChanged = currentUser.email !== parsedBody.email;
          const roleChanged = currentUserRole.roleId !== requestedRole.id;
          if (!emailChanged && !roleChanged) {
            return { kind: "applied" };
          }

          const nextVersion = currentUser.version + 1;
          await tx
            .update(users)
            .set({ version: nextVersion, ...(emailChanged ? { email: parsedBody.email } : {}) })
            .where(eq(users.id, target.id));

          if (emailChanged) {
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
              previousValue: { email: currentUser.email },
              newValue: { email: parsedBody.email },
            });
          }

          if (roleChanged) {
            await tx
              .update(userRoles)
              .set({ roleId: requestedRole.id })
              .where(eq(userRoles.userId, target.id));

            await tx.insert(auditLog).values({
              entity: "user",
              entityId: target.id,
              actorId: openSession.userId,
              previousValue: { roleId: currentUserRole.roleId },
              newValue: { roleId: requestedRole.id },
            });
          }

          return { kind: "applied" };
        })
        .catch((error: unknown): EditOutcome => {
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
      if (outcome.kind === "last_administrator") {
        await reply.code(409).send(LAST_ADMINISTRATOR_RESPONSE);
        return;
      }

      const updated = await findBranchUser(options.db, openSession.locationId, target.id);
      if (!updated) {
        // The transaction above only ever changes this row's email or role, never deactivates or
        // removes it; unreachable in practice.
        throw new Error("edited user vanished right after a successful edit");
      }
      await reply.code(200).send(toBranchUserWire(updated));
    },
  );
}
