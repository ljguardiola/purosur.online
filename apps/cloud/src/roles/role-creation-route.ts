import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, rolePermissions, roles } from "../db/schema.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "../passkeys/passkey-challenge.js";
import { verifyPasskeyReauthentication } from "../passkeys/passkey-reauthentication.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { ADMINISTRATOR_ACCESS, enforceRouteAccess } from "../session/route-access.js";
import {
  type RoleFieldValidationFailure,
  readRoleName,
  readRolePermissionKeys,
  roleNameValidationFailure,
  rolePermissionsValidationFailure,
} from "./role-validation.js";
import type { RoleSummaryRow, RolesRouteOptions } from "./roles-list-route.js";
import { toRoleSummaryWire } from "./roles-list-route.js";

const AUTHENTICATION_TIMEOUT_MS = 60_000;

// Same uniform code and message the other passkey step-up routes reject a bad reauthentication
// with.
const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey reauthentication could not be verified",
} as const;

export const ROLE_NAME_TAKEN_RESPONSE = {
  code: "role_name_taken",
  message: "a role with that name already exists",
} as const;

const UNIQUE_VIOLATION = "23505";
const ROLE_NAME_UNIQUE_INDEX = "roles_name_lower_key";

export class RoleNameTaken extends Error {}

/**
 * Walks the driver error (wrapped by Drizzle as its `cause`) for a unique violation on the
 * case-insensitive `roles.name` index. postgres-js, the production driver, names the index
 * `constraint_name`; PGlite, which the unit tests run on, names it `constraint`. The transaction
 * below already checks for a taken name itself, so this is only the backstop for a name that lands
 * concurrently between that check and the insert; `role-edit-route.ts` reuses this same mapping
 * for its own edit transaction.
 */
export function isRoleNameUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    const index = constraint_name ?? constraint;
    if (code === UNIQUE_VIOLATION && index === ROLE_NAME_UNIQUE_INDEX) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

interface CreationRequestBody {
  name: string;
  permissionKeys: string[];
}

function readAssertion(body: unknown): AuthenticationResponseJSON | undefined {
  const assertion = (body as { reauthentication?: unknown } | undefined)?.reauthentication as
    | AuthenticationResponseJSON
    | undefined;
  return assertion && typeof assertion.id === "string" ? assertion : undefined;
}

function readCreationBody(body: unknown): CreationRequestBody | RoleFieldValidationFailure {
  const name = readRoleName(body);
  const nameFailure = roleNameValidationFailure(name);
  if (nameFailure) {
    return nameFailure;
  }
  if (!name) {
    // Unreachable: `roleNameValidationFailure` above already rejects an empty or missing name.
    return { field: "name", message: "name must not be empty" };
  }
  const permissionKeys = readRolePermissionKeys(body);
  if (!permissionKeys) {
    return { field: "permissions", message: "permissions must be an array of permission keys" };
  }
  const permissionsFailure = rolePermissionsValidationFailure(permissionKeys);
  if (permissionsFailure) {
    return permissionsFailure;
  }
  return { name, permissionKeys };
}

function isValidationFailure(
  value: CreationRequestBody | RoleFieldValidationFailure,
): value is RoleFieldValidationFailure {
  return "field" in value;
}

export interface CreateRoleInput {
  name: string;
  permissionKeys: string[];
  actorId: string;
}

export type CreateRoleOutcome = { kind: "name_taken" } | { kind: "created"; role: RoleSummaryRow };

/**
 * Creates a role, its permission rows, and an audit row in one transaction. The name uniqueness
 * check runs first, inside the transaction; the database's own case-insensitive unique index
 * (`roles_name_lower_key`) is the backstop for a name that lands concurrently, mapped by
 * `isRoleNameUniqueViolation` the same way it would be caught by the check above.
 */
export async function createRole<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: CreateRoleInput,
): Promise<CreateRoleOutcome> {
  const created = await db
    .transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(sql`lower(${roles.name}) = lower(${input.name})`)
        .limit(1);
      if (existing) {
        throw new RoleNameTaken();
      }

      const [newRole] = await tx
        .insert(roles)
        .values({ name: input.name, isAdministrator: false })
        .returning({ id: roles.id });
      if (!newRole) {
        throw new Error("inserting the role returned no row");
      }

      if (input.permissionKeys.length > 0) {
        await tx.insert(rolePermissions).values(
          input.permissionKeys.map((permissionKey) => ({
            roleId: newRole.id,
            permissionKey,
          })),
        );
      }

      await tx.insert(auditLog).values({
        entity: "role",
        entityId: newRole.id,
        actorId: input.actorId,
        previousValue: null,
        newValue: { name: input.name, permissions: input.permissionKeys },
      });

      return newRole;
    })
    .catch((error: unknown) => {
      if (error instanceof RoleNameTaken || isRoleNameUniqueViolation(error)) {
        return undefined;
      }
      throw error;
    });

  if (!created) {
    return { kind: "name_taken" };
  }
  return {
    kind: "created",
    role: {
      id: created.id,
      name: input.name,
      isAdministrator: false,
      permissionKeys: input.permissionKeys,
      userCount: 0,
    },
  };
}

/**
 * Registers the two endpoints that let an Administrator create a new role, mirroring
 * `user-creation-route.ts`'s own shape: `creation-options` hands back a reauthentication challenge
 * against the Administrator's own existing passkeys, and `POST /roles` verifies it before creating
 * the role, its permission rows, and an audit row in one transaction. The name uniqueness check
 * runs inside that transaction first; the database's own case-insensitive unique index
 * (`roles_name_lower_key`) is the backstop for a name that lands concurrently.
 */
export function registerRoleCreationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RolesRouteOptions<TQueryResult>,
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

  app.post(
    "/roles/creation-options",
    { config: { access: ADMINISTRATOR_ACCESS } },
    async (request, reply) => {
      if (!checkOrigin(request, reply)) {
        return;
      }
      const issuedAt = now();
      const openSession = await enforceRouteAccess(request, reply, {
        db: options.db,
        now: issuedAt,
      });
      if (!openSession) {
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
        kind: "role_creation",
        reauthenticationChallenge: reauthenticationOptions.challenge,
        now: issuedAt,
      });

      await reply.code(200).send({ reauthentication_options: reauthenticationOptions });
    },
  );

  app.post("/roles", { config: { access: ADMINISTRATOR_ACCESS } }, async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const attemptedAt = now();
    const openSession = await enforceRouteAccess(request, reply, {
      db: options.db,
      now: attemptedAt,
    });
    if (!openSession) {
      return;
    }

    const parsedBody = readCreationBody(request.body);
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
    if (pending?.kind !== "role_creation") {
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

    const outcome = await createRole(options.db, {
      name: parsedBody.name,
      permissionKeys: parsedBody.permissionKeys,
      actorId: openSession.userId,
    });

    if (outcome.kind === "name_taken") {
      await reply.code(409).send(ROLE_NAME_TAKEN_RESPONSE);
      return;
    }

    await reply.code(201).send(toRoleSummaryWire(outcome.role));
  });
}
