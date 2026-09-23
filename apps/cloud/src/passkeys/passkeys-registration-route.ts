import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, users } from "../db/schema.js";
import { deriveUserHandle } from "../recovery/recovery-user-handle.js";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { resolveOpenSession, UNAUTHENTICATED_RESPONSE } from "../session/open-session.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "./passkey-challenge.js";
import { verifyPasskeyReauthentication } from "./passkey-reauthentication.js";

export interface PasskeyRegistrationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the issued challenge's stored lifetime and audited timestamps are deterministic. */
  now?: () => Date;
}

const AUTHENTICATION_TIMEOUT_MS = 60_000;
const PASSKEY_NAME_MAX_LENGTH = 40;

// Every reauthentication rejection reason (unverified signature, another account's credential, a
// missing/expired/consumed challenge) answers with this same code, the same uniform shape
// session-authenticate-route.ts's sign-in check answers a failed assertion with.
const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey reauthentication could not be verified",
} as const;

class CredentialAlreadyRegistered extends Error {}

/** Trims `passkey_name` and requires it to be 1-40 characters once trimmed (issue #169). */
function readPasskeyName(body: unknown): string | undefined {
  const rawName = (body as { passkey_name?: unknown } | undefined)?.passkey_name;
  if (typeof rawName !== "string") {
    return undefined;
  }
  const trimmed = rawName.trim();
  return trimmed.length >= 1 && trimmed.length <= PASSKEY_NAME_MAX_LENGTH ? trimmed : undefined;
}

function readAssertion(body: unknown): AuthenticationResponseJSON | undefined {
  const assertion = (body as { reauthentication?: unknown } | undefined)?.reauthentication as
    | AuthenticationResponseJSON
    | undefined;
  return assertion && typeof assertion.id === "string" ? assertion : undefined;
}

/**
 * Registers the two endpoints that add a passkey to an already-open session's account (issue
 * #169): `registration-options` hands back both a reauthentication challenge (against the
 * account's existing passkeys) and a registration challenge (excluding them), and `POST
 * /users/passkeys` verifies both, in that order, before registering the new credential under the
 * given name. Neither ever revokes the session.
 */
export function registerPasskeyRegistrationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeyRegistrationRouteOptions<TQueryResult>,
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

  app.post("/users/passkeys/registration-options", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const issuedAt = now();
    const openSession = await resolveOpenSession(request, { db: options.db, now: issuedAt });
    if (!openSession) {
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }

    const [account] = await options.db
      .select({ firstName: users.firstName, email: users.email })
      .from(users)
      .where(eq(users.id, openSession.userId))
      .limit(1);
    if (!account) {
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
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

    const registrationOptions = await generateRegistrationOptions({
      rpName: webAuthnConfig.rpName,
      rpID: webAuthnConfig.rpID,
      userName: account.email,
      userDisplayName: account.firstName,
      userID: deriveUserHandle(openSession.userId),
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.credentialId,
        ...(passkey.transports ? { transports: passkey.transports } : {}),
      })),
    });

    await pruneExpiredPasskeyChallenges(options.db, issuedAt);
    await storePendingPasskeyChallenge(options.db, {
      sessionId: openSession.sessionId,
      kind: "registration",
      reauthenticationChallenge: reauthenticationOptions.challenge,
      registrationChallenge: registrationOptions.challenge,
      now: issuedAt,
    });

    await reply.code(200).send({
      reauthentication_options: reauthenticationOptions,
      passkey_registration_options: registrationOptions,
    });
  });

  app.post("/users/passkeys", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    const attemptedAt = now();
    const openSession = await resolveOpenSession(request, { db: options.db, now: attemptedAt });
    if (!openSession) {
      await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
      return;
    }

    const pending = await consumePendingPasskeyChallenge(options.db, {
      sessionId: openSession.sessionId,
      now: attemptedAt,
    });
    const assertion = readAssertion(request.body);
    if (pending?.kind !== "registration" || !pending.registrationChallenge || !assertion) {
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

    const passkeyRegistration = (request.body as { passkey_registration?: unknown } | undefined)
      ?.passkey_registration as RegistrationResponseJSON | undefined;
    if (!passkeyRegistration) {
      await reply.code(400).send({
        code: "validation_failed",
        message: "passkey_registration is required",
        details: [{ field: "passkey_registration" }],
      });
      return;
    }

    const passkeyName = readPasskeyName(request.body);
    if (!passkeyName) {
      await reply.code(400).send({
        code: "validation_failed",
        message: "passkey_name is required and must be 1-40 characters once trimmed",
        details: [{ field: "passkey_name" }],
      });
      return;
    }

    const verification = await verifyRegistrationResponse({
      response: passkeyRegistration,
      expectedChallenge: pending.registrationChallenge,
      expectedOrigin: webAuthnConfig.expectedOrigin,
      expectedRPID: webAuthnConfig.rpID,
      requireUserVerification: true,
    }).catch(() => ({ verified: false as const }));
    if (!verification.verified) {
      await reply.code(400).send({
        code: "validation_failed",
        message: "the passkey registration did not verify against the backoffice's origin",
        details: [{ field: "passkey_registration" }],
      });
      return;
    }
    const { registrationInfo } = verification;

    const inserted = await options.db
      .transaction(async (tx) => {
        const [newPasskey] = await tx
          .insert(passkeys)
          .values({
            userId: openSession.userId,
            credentialId: registrationInfo.credential.id,
            publicKey: Buffer.from(registrationInfo.credential.publicKey).toString("base64url"),
            counter: registrationInfo.credential.counter,
            transports: registrationInfo.credential.transports ?? null,
            deviceType: registrationInfo.credentialDeviceType,
            backedUp: registrationInfo.credentialBackedUp,
            name: passkeyName,
          })
          .onConflictDoNothing({ target: passkeys.credentialId })
          .returning({ id: passkeys.id, createdAt: passkeys.createdAt });
        if (!newPasskey) {
          throw new CredentialAlreadyRegistered();
        }

        await tx.insert(auditLog).values({
          entity: "passkey",
          entityId: newPasskey.id,
          actorId: openSession.userId,
          previousValue: null,
          newValue: {
            id: newPasskey.id,
            name: passkeyName,
            credentialId: registrationInfo.credential.id,
            deviceType: registrationInfo.credentialDeviceType,
            backedUp: registrationInfo.credentialBackedUp,
          },
        });

        return newPasskey;
      })
      .catch((error: unknown) => {
        if (error instanceof CredentialAlreadyRegistered) {
          return undefined;
        }
        throw error;
      });

    if (!inserted) {
      await reply.code(400).send({
        code: "validation_failed",
        message: "this passkey is already registered",
        details: [{ field: "passkey_registration" }],
      });
      return;
    }

    await reply.code(200).send({
      id: inserted.id,
      name: passkeyName,
      created_at: inserted.createdAt.toISOString(),
      last_used_at: null,
    });
  });
}
