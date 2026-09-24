import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, roles, userRoles, users } from "../db/schema.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "../passkeys/passkey-challenge.js";
import { verifyPasskeyReauthentication } from "../passkeys/passkey-reauthentication.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { requireOpenSession } from "../session/open-session.js";
import { toBranchUserWire } from "./branch-users.js";
import { readEmail } from "./email-validation.js";
import { FORBIDDEN_RESPONSE } from "./forbidden-response.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const AUTHENTICATION_TIMEOUT_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same uniform code and message the passkey routes reject a bad reauthentication with.
const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey reauthentication could not be verified",
} as const;

const UNKNOWN_ROLE_RESPONSE = {
  code: "unknown_role",
  message: "no role with that id exists",
} as const;

const EMAIL_TAKEN_RESPONSE = {
  code: "email_taken",
  message: "a user with that email already exists",
} as const;

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

function readAssertion(body: unknown): AuthenticationResponseJSON | undefined {
  const assertion = (body as { reauthentication?: unknown } | undefined)?.reauthentication as
    | AuthenticationResponseJSON
    | undefined;
  return assertion && typeof assertion.id === "string" ? assertion : undefined;
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
 * Registers the two endpoints that let an Administrator create a new backoffice user (issue
 * #247), guarded by the same fresh-reauthentication step-up `passkeys-removal-route.ts` uses:
 * `creation-options` hands back a reauthentication challenge against the Administrator's own
 * existing passkeys (never the new user's, who has none yet), and `POST /users` verifies it
 * before creating the user in the session's own branch with the chosen existing role and no
 * passkeys.
 */
export function registerUserCreationRoutes<TQueryResult extends PgQueryResultHKT>(
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

  app.post("/users/creation-options", async (request, reply) => {
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
      kind: "user_creation",
      reauthenticationChallenge: reauthenticationOptions.challenge,
      now: issuedAt,
    });

    await reply.code(200).send({ reauthentication_options: reauthenticationOptions });
  });

  app.post("/users", async (request, reply) => {
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
    if (pending?.kind !== "user_creation") {
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
      await reply.code(409).send(EMAIL_TAKEN_RESPONSE);
      return;
    }

    await reply.code(201).send(
      toBranchUserWire({
        id: created.id,
        firstName: parsedBody.firstName,
        email: parsedBody.email,
        version: 1,
        roleId: role.id,
        roleName: role.name,
        roleIsAdministrator: role.isAdministrator,
      }),
    );
  });
}
