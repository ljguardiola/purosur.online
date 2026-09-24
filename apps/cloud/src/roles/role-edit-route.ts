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
import { requireOpenSession } from "../session/open-session.js";
import { FORBIDDEN_RESPONSE } from "../users/forbidden-response.js";
import { PERMISSION_KEYS } from "./permission-catalog.js";
import {
  isRoleNameUniqueViolation,
  ROLE_NAME_TAKEN_RESPONSE,
  RoleNameTaken,
} from "./role-creation-route.js";
import { countRoleUsers, findEditableRole, toRoleDetailWire } from "./role-read-route.js";
import {
  type RoleFieldValidationFailure,
  readRoleName,
  readRolePermissionKeys,
  roleNameValidationFailure,
  rolePermissionsValidationFailure,
} from "./role-validation.js";
import type { RolesRouteOptions } from "./roles-list-route.js";

const AUTHENTICATION_TIMEOUT_MS = 60_000;

const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey reauthentication could not be verified",
} as const;

// Same reasoning `role-read-route.ts` gives: the Administrator role, a missing id, and a
// malformed one all answer alike, so none of the three ever leaks which one it was.
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no editable role with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this role was changed since it was loaded",
} as const;

interface EditRequestBody {
  name: string;
  permissionKeys: string[];
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

function readEditBody(body: unknown): EditRequestBody | RoleFieldValidationFailure {
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
  const version = readVersion(body);
  if (version === undefined) {
    return { field: "version", message: "version must be the positive integer it was loaded with" };
  }
  return { name, permissionKeys, version };
}

function isValidationFailure(
  value: EditRequestBody | RoleFieldValidationFailure,
): value is RoleFieldValidationFailure {
  return "field" in value;
}

export interface EditRoleInput {
  id: string;
  name: string;
  permissionKeys: string[];
  version: number;
  actorId: string;
  locationId: string;
}

export interface EditedRole {
  id: string;
  name: string;
  isAdministrator: false;
  permissionKeys: string[];
  userCount: number;
  version: number;
}

export type EditRoleOutcome =
  | { kind: "stale_version" }
  | { kind: "name_taken" }
  | { kind: "applied"; role: EditedRole };

/**
 * Updates one hand-made role's name and permissions in one transaction, rejecting a save made over
 * a version someone else already changed the same way `changeUserEmail` (`user-email-change-
 * route.ts`) rejects a stale user save. A name that already belongs to another role is rejected
 * the same way `createRole` (`role-creation-route.ts`) rejects one, including its own database
 * backstop for a name that lands concurrently. Leaving the name and permission set exactly as they
 * were is a no-op: the version does not bump and nothing is audited.
 */
export async function editRole<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditRoleInput,
): Promise<EditRoleOutcome> {
  const outcome = await db
    .transaction<EditRoleOutcome>(async (tx) => {
      // Locks this one row so a concurrent edit against the same role waits instead of racing: the
      // version check below and the write it may lead to happen against a value that cannot change
      // out from under this transaction while it holds the lock.
      const [current] = await tx
        .select({
          name: roles.name,
          isAdministrator: roles.isAdministrator,
          version: roles.version,
        })
        .from(roles)
        .where(eq(roles.id, input.id))
        .for("update");
      if (!current || current.isAdministrator) {
        // The pre-transaction lookup already confirmed an editable role at this id; nothing in
        // this codebase deletes a role or flips its Administrator flag, so this is unreachable in
        // practice. Answering stale_version, not a crash, keeps this route's failure shape uniform.
        return { kind: "stale_version" };
      }
      if (current.version !== input.version) {
        return { kind: "stale_version" };
      }

      const [nameTaken] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(sql`lower(${roles.name}) = lower(${input.name}) and ${roles.id} != ${input.id}`)
        .limit(1);
      if (nameTaken) {
        throw new RoleNameTaken();
      }

      const currentPermissionRows = await tx
        .select({ permissionKey: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, input.id));
      const currentPermissionKeys = currentPermissionRows.map((row) => row.permissionKey);
      const currentPermissionSet = new Set(currentPermissionKeys);
      const nextPermissionSet = new Set(input.permissionKeys);
      const sameName = current.name === input.name;
      const samePermissions =
        currentPermissionSet.size === nextPermissionSet.size &&
        [...currentPermissionSet].every((key) => nextPermissionSet.has(key));

      if (sameName && samePermissions) {
        return {
          kind: "applied",
          role: {
            id: input.id,
            name: input.name,
            isAdministrator: false,
            permissionKeys: PERMISSION_KEYS.filter((key) => currentPermissionSet.has(key)),
            userCount: 0,
            version: current.version,
          },
        };
      }

      const nextVersion = current.version + 1;
      const nextPermissionKeys = PERMISSION_KEYS.filter((key) => nextPermissionSet.has(key));
      await tx
        .update(roles)
        .set({ name: input.name, version: nextVersion })
        .where(eq(roles.id, input.id));
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, input.id));
      if (input.permissionKeys.length > 0) {
        await tx.insert(rolePermissions).values(
          input.permissionKeys.map((permissionKey) => ({
            roleId: input.id,
            permissionKey,
          })),
        );
      }

      await tx.insert(auditLog).values({
        entity: "role",
        entityId: input.id,
        actorId: input.actorId,
        previousValue: {
          name: current.name,
          permissions: PERMISSION_KEYS.filter((key) => currentPermissionSet.has(key)),
        },
        newValue: { name: input.name, permissions: nextPermissionKeys },
      });

      return {
        kind: "applied",
        role: {
          id: input.id,
          name: input.name,
          isAdministrator: false,
          permissionKeys: nextPermissionKeys,
          userCount: 0,
          version: nextVersion,
        },
      };
    })
    .catch((error: unknown): EditRoleOutcome => {
      if (error instanceof RoleNameTaken || isRoleNameUniqueViolation(error)) {
        return { kind: "name_taken" };
      }
      throw error;
    });

  if (outcome.kind !== "applied") {
    return outcome;
  }
  const userCount = await countRoleUsers(db, input.id, input.locationId);
  return { kind: "applied", role: { ...outcome.role, userCount } };
}

/**
 * Registers the two endpoints that let an Administrator edit an existing hand-made role's name or
 * permissions, mirroring `user-email-change-route.ts`'s own shape: `edit-options` hands back a
 * reauthentication challenge against the Administrator's own existing passkeys, and
 * `POST /roles/:id/edit` verifies it before applying the change. The Administrator role is never a
 * valid target for either route.
 */
export function registerRoleEditRoutes<TQueryResult extends PgQueryResultHKT>(
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

  app.post<{ Params: { id: string } }>("/roles/:id/edit-options", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const issuedAt = now();
    const openSession = await requireOpenSession(request, reply, { db: options.db, now: issuedAt });
    if (!openSession) {
      return;
    }
    if (!openSession.isAdministrator) {
      await reply.code(403).send(FORBIDDEN_RESPONSE);
      return;
    }

    const target = await findEditableRole(options.db, request.params.id);
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
      kind: "role_edit",
      reauthenticationChallenge: reauthenticationOptions.challenge,
      now: issuedAt,
    });

    await reply.code(200).send({ reauthentication_options: reauthenticationOptions });
  });

  app.post<{ Params: { id: string } }>("/roles/:id/edit", async (request, reply) => {
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

    const target = await findEditableRole(options.db, request.params.id);
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

    const assertion = readAssertion(request.body);
    if (!assertion) {
      await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
      return;
    }

    const pending = await consumePendingPasskeyChallenge(options.db, {
      sessionId: openSession.sessionId,
      now: attemptedAt,
    });
    if (pending?.kind !== "role_edit") {
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

    const outcome = await editRole(options.db, {
      id: target.id,
      name: parsedBody.name,
      permissionKeys: parsedBody.permissionKeys,
      version: parsedBody.version,
      actorId: openSession.userId,
      locationId: openSession.locationId,
    });

    if (outcome.kind === "stale_version") {
      await reply.code(409).send(STALE_VERSION_RESPONSE);
      return;
    }
    if (outcome.kind === "name_taken") {
      await reply.code(409).send(ROLE_NAME_TAKEN_RESPONSE);
      return;
    }

    await reply.code(200).send(toRoleDetailWire(outcome.role));
  });
}
