import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, roles, userRoles, users } from "../db/schema.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  originGuard,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import { canReactivateUsers, toBranchUserWire } from "./branch-users.js";
import { readEmail } from "./email-validation.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNKNOWN_ROLE_RESPONSE = {
  code: "unknown_role",
  message: "no role with that id exists",
} as const;

const EMAIL_TAKEN_RESPONSE = {
  code: "email_taken",
  message: "a user with that email already exists",
} as const;

/**
 * Answered instead of the plain `email_taken` above when the conflicting email belongs to a
 * deactivated user and the caller can reactivate one (`canReactivateUsers`): carries that user's id
 * and display name so the form can lead the caller to reactivating them instead of creating a
 * second account.
 */
function emailBelongsToDeactivatedUserResponse(target: { id: string; firstName: string }) {
  return {
    code: "email_belongs_to_deactivated_user",
    message: "that email belongs to a deactivated user; reactivate them instead",
    id: target.id,
    name: target.firstName,
  } as const;
}

class EmailAlreadyTaken extends Error {}

interface CreationRequestBody {
  firstName: string;
  email: string;
  roleId: string;
}

interface ValidationFailure {
  field: "first_name" | "email" | "role_id";
  message: string;
}

/** Trims `first_name` and requires it non-empty once trimmed; no length cap exists elsewhere in the codebase to reuse. */
function readFirstName(body: unknown): string | undefined {
  const raw = (body as { first_name?: unknown } | undefined)?.first_name;
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRoleId(body: unknown): string | undefined {
  const raw = (body as { role_id?: unknown } | undefined)?.role_id;
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

function readCreationBody(body: unknown): CreationRequestBody | ValidationFailure {
  const firstName = readFirstName(body);
  if (!firstName) {
    return { field: "first_name", message: "first_name must not be empty" };
  }
  const email = readEmail(body);
  if (!email) {
    return { field: "email", message: "email must look like local@domain" };
  }
  const roleId = readRoleId(body);
  if (!roleId) {
    return { field: "role_id", message: "role_id must be a role's id" };
  }
  return { firstName, email, roleId };
}

function isValidationFailure(
  value: CreationRequestBody | ValidationFailure,
): value is ValidationFailure {
  return "field" in value;
}

/**
 * Registers `POST /users`: creates a new backoffice user, gated by the shared
 * passkey-authorization window (`passkey-authorization-guard.ts`) instead of its own per-action
 * step-up. Creates the user in the session's own branch with the chosen existing role and no
 * passkeys.
 */
export function registerUserCreationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

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

  app.post(
    "/users",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = readCreationBody(request.body);
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

      const [role] = await options.db
        .select({ id: roles.id, name: roles.name, isAdministrator: roles.isAdministrator })
        .from(roles)
        .where(eq(roles.id, parsedBody.roleId))
        .limit(1);
      if (!role) {
        await reply.code(400).send(UNKNOWN_ROLE_RESPONSE);
        return;
      }

      const created = await options.db
        .transaction(async (tx) => {
          const [newUser] = await tx
            .insert(users)
            .values({
              firstName: parsedBody.firstName,
              email: parsedBody.email,
              locationId: openSession.locationId,
            })
            .onConflictDoNothing({ target: users.email })
            .returning({ id: users.id });
          if (!newUser) {
            throw new EmailAlreadyTaken();
          }

          await tx.insert(userRoles).values({ userId: newUser.id, roleId: role.id });

          await tx.insert(auditLog).values({
            entity: "user",
            entityId: newUser.id,
            actorId: openSession.userId,
            previousValue: null,
            newValue: { firstName: parsedBody.firstName, email: parsedBody.email, roleId: role.id },
          });

          return newUser;
        })
        .catch((error: unknown) => {
          if (error instanceof EmailAlreadyTaken) {
            return undefined;
          }
          throw error;
        });

      if (!created) {
        // The conflict is never branch-scoped, the same way `users.email`'s own unique index
        // isn't: a deactivated user in any branch with this email blocks creation the same way an
        // active one does, just with a response that leads to reactivating them instead.
        const [conflicting] = await options.db
          .select({ id: users.id, firstName: users.firstName, active: users.active })
          .from(users)
          .where(eq(users.email, parsedBody.email))
          .limit(1);
        if (conflicting && !conflicting.active && canReactivateUsers(openSession)) {
          await reply.code(409).send(emailBelongsToDeactivatedUserResponse(conflicting));
          return;
        }
        await reply.code(409).send(EMAIL_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(
        toBranchUserWire({
          id: created.id,
          firstName: parsedBody.firstName,
          email: parsedBody.email,
          version: 1,
          active: true,
          roleId: role.id,
          roleName: role.name,
          roleIsAdministrator: role.isAdministrator,
          passkeyCount: 0,
          // Only an active Administrator of this same branch can create a user, so a just-created
          // user is never the sole active Administrator, even given that role.
          isLastActiveAdministrator: false,
        }),
      );
    },
  );
}
