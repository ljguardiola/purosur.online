import { userEditBodySchema } from "@purosur/contracts";
import { increasesAccess } from "@purosur/domain";
import { type BranchUser, findBranchUser } from "@purosur/domain/access/use-cases";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { openAlert } from "../alerts/open-alert.js";
import {
  auditLog,
  recoveryTokens,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { withPendingChanges } from "../sync/change-log.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { toBranchUserWire } from "./branch-users.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// postgres-js names the index `constraint_name`; PGlite names it `constraint`.
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

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

interface RoleWithPermissions {
  name: string | null;
  isAdministrator: boolean;
  permissionKeys: string[];
}

// Shares the role's row lock so an edit of that role's permissions, which locks it for update,
// either commits before this read or waits for this assignment and then sees the user among its
// holders: a permission added meanwhile can't reach the user without an alert.
async function lockRoleWithPermissions<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  roleId: string,
): Promise<RoleWithPermissions> {
  const [role] = await tx
    .select({ name: roles.name, isAdministrator: roles.isAdministrator })
    .from(roles)
    .where(eq(roles.id, roleId))
    .for("share");
  if (!role) {
    throw new Error("an assigned role no longer exists");
  }
  const permissionRows = await tx
    .select({ permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
  return { ...role, permissionKeys: permissionRows.map((row) => row.permissionKey) };
}

type EditOutcome =
  | { kind: "stale_version" }
  | { kind: "email_taken" }
  | { kind: "last_administrator" }
  | { kind: "applied"; user: BranchUser };

export function registerUserEditRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  async function findTarget(locationId: string, targetId: string) {
    if (!UUID_PATTERN.test(targetId)) {
      return undefined;
    }
    return findBranchUser(
      { users: drizzleBranchUsers(options.db) },
      { locationId, userId: targetId },
    );
  }

  app.put<{ Params: { id: string } }>(
    "/users/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
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

      const parsedBody = await readValidatedBody(reply, userEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const [requestedRole] = await options.db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.id, parsedBody.role_id))
        .limit(1);
      if (!requestedRole) {
        await reply.code(400).send(UNKNOWN_ROLE_RESPONSE);
        return;
      }

      const outcome = await withPendingChanges<TQueryResult, EditOutcome>(
        options.db,
        undefined,
        async (tx, changes) => {
          // Locks the single Administrator role row before counting its active holders, so two
          // concurrent role changes serialize on it instead of both reading "not the last one".
          const [administratorRole] = await tx
            .select({ id: roles.id })
            .from(roles)
            .where(eq(roles.isAdministrator, true))
            .for("update");
          if (!administratorRole) {
            return { kind: "stale_version" };
          }

          // Every role change holds the Administrator role lock taken above, so this read can't
          // change before the user row is locked below.
          const [currentUserRole] = await tx
            .select({ roleId: userRoles.roleId })
            .from(userRoles)
            .where(eq(userRoles.userId, target.id));
          if (!currentUserRole) {
            return { kind: "stale_version" };
          }

          const roleChanged = currentUserRole.roleId !== requestedRole.id;
          // Taken before the user row lock: a role edit holding one of these roles writes rows
          // that reference users, which would wait on a user row this transaction already locked.
          const roleAccessChange = roleChanged
            ? {
                previousRole: await lockRoleWithPermissions(tx, currentUserRole.roleId),
                newRole: await lockRoleWithPermissions(tx, requestedRole.id),
              }
            : undefined;

          // Locks this one user row so a concurrent edit against the same user waits instead of
          // racing: the version check below runs against a value that can't change under it.
          const [currentUser] = await tx
            .select({ email: users.email, version: users.version })
            .from(users)
            .where(eq(users.id, target.id))
            .for("update");
          if (!currentUser || currentUser.version !== parsedBody.version) {
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
          if (emailChanged || roleChanged) {
            await tx
              .update(users)
              .set({
                version: currentUser.version + 1,
                ...(emailChanged ? { email: parsedBody.email } : {}),
              })
              .where(eq(users.id, target.id));
            changes.note({
              entity: "user",
              entityId: target.id,
              version: currentUser.version + 1,
              op: "update",
              locationId: openSession.locationId,
            });
          }

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

            await openAlert(
              tx,
              {
                kind: "user_email_changed",
                scope: target.id,
                detail: {
                  previousEmail: currentUser.email,
                  newEmail: parsedBody.email,
                  actorId: openSession.userId,
                },
              },
              { now },
            );
          }

          if (roleAccessChange) {
            const { previousRole, newRole } = roleAccessChange;
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

            if (increasesAccess(previousRole, newRole)) {
              await openAlert(
                tx,
                {
                  kind: "user_access_increased",
                  scope: target.id,
                  detail: {
                    cause: "role_assigned",
                    previousRole: {
                      name: previousRole.name,
                      isAdministrator: previousRole.isAdministrator,
                    },
                    newRole: { name: newRole.name, isAdministrator: newRole.isAdministrator },
                    actorId: openSession.userId,
                  },
                },
                { now },
              );
            }
          }

          // Read under the locks this transaction still holds, so a deactivation waiting on this
          // user's row can't commit before this read runs.
          const edited = await findBranchUser(
            { users: drizzleBranchUsers(tx) },
            { locationId: openSession.locationId, userId: target.id },
          );
          if (!edited) {
            // Deactivation bumps `version` too, so the match above already ruled this out; roll back
            // rather than answer for an edit that did not apply.
            throw new Error("edited user is no longer an active user of this branch");
          }
          return { kind: "applied", user: edited };
        },
      ).catch((error: unknown): EditOutcome => {
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

      await reply.code(200).send(toBranchUserWire(outcome.user));
    },
  );
}
