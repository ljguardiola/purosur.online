import { userCreationBodySchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, roles, userRoles, users } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { canReactivateUsers, toBranchUserWire } from "./branch-users.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import {
  ADMINISTRATOR_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const UNKNOWN_ROLE_RESPONSE = {
  code: "unknown_role",
  message: "no role with that id exists",
} as const;

const EMAIL_TAKEN_RESPONSE = {
  code: "email_taken",
  message: "a user with that email already exists",
} as const;

function emailBelongsToDeactivatedUserResponse(target: { id: string; firstName: string }) {
  return {
    code: "email_belongs_to_deactivated_user",
    message: "that email belongs to a deactivated user; reactivate them instead",
    id: target.id,
    name: target.firstName,
  } as const;
}

class EmailAlreadyTaken extends Error {}

export interface CreateUserInput {
  firstName: string;
  email: string;
  roleId: string;
  locationId: string;
  actorId: string;
}

export interface CreateUserDeps {
  now: () => Date;
}

interface CreatedUserRole {
  id: string;
  name: string | null;
  isAdministrator: boolean;
}

export type CreateUserOutcome =
  | { kind: "unknown_role" }
  | { kind: "email_taken" }
  | { kind: "created"; id: string; role: CreatedUserRole };

export async function createUser<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: CreateUserInput,
  deps: CreateUserDeps,
): Promise<CreateUserOutcome> {
  const [role] = await db
    .select({ id: roles.id, name: roles.name, isAdministrator: roles.isAdministrator })
    .from(roles)
    .where(eq(roles.id, input.roleId))
    .limit(1);
  if (!role) {
    return { kind: "unknown_role" };
  }

  const created = await db
    .transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          firstName: input.firstName,
          email: input.email,
          locationId: input.locationId,
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
        actorId: input.actorId,
        previousValue: null,
        newValue: { firstName: input.firstName, email: input.email, roleId: role.id },
      });

      if (role.isAdministrator) {
        await openAlert(
          tx,
          {
            kind: "user_access_increased",
            scope: newUser.id,
            detail: { cause: "created_as_administrator", actorId: input.actorId },
          },
          deps,
        );
      }

      return newUser;
    })
    .catch((error: unknown) => {
      if (error instanceof EmailAlreadyTaken) {
        return undefined;
      }
      throw error;
    });

  if (!created) {
    return { kind: "email_taken" };
  }
  return { kind: "created", id: created.id, role };
}

export function registerUserCreationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/users",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: ADMINISTRATOR_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = await readValidatedBody(reply, userCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await createUser(
        options.db,
        {
          firstName: parsedBody.first_name,
          email: parsedBody.email,
          roleId: parsedBody.role_id,
          locationId: openSession.locationId,
          actorId: openSession.userId,
        },
        { now },
      );

      if (outcome.kind === "unknown_role") {
        await reply.code(400).send(UNKNOWN_ROLE_RESPONSE);
        return;
      }

      if (outcome.kind === "email_taken") {
        // Naming the conflicting user is branch-scoped even though the email conflict is not, so
        // another branch's user is never revealed.
        const [conflicting] = await options.db
          .select({
            id: users.id,
            firstName: users.firstName,
            active: users.active,
            locationId: users.locationId,
          })
          .from(users)
          .where(eq(users.email, parsedBody.email))
          .limit(1);
        if (
          conflicting &&
          !conflicting.active &&
          conflicting.locationId === openSession.locationId &&
          canReactivateUsers(openSession)
        ) {
          await reply.code(409).send(emailBelongsToDeactivatedUserResponse(conflicting));
          return;
        }
        await reply.code(409).send(EMAIL_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(
        toBranchUserWire({
          id: outcome.id,
          firstName: parsedBody.first_name,
          email: parsedBody.email,
          version: 1,
          active: true,
          roleId: outcome.role.id,
          roleName: outcome.role.name,
          roleIsAdministrator: outcome.role.isAdministrator,
          passkeyCount: 0,
          isLastActiveAdministrator: false,
        }),
      );
    },
  );
}
