import {
  passkeyRegistrationBodySchema,
  passkeyRegistrationChallengeSchema,
  passkeySummarySchema,
} from "@purosur/contracts";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, passkeys, users } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { UNAUTHENTICATED_RESPONSE } from "./open-session.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "./passkey-challenge.js";
import { deriveUserHandle } from "./recovery-user-handle.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface PasskeyRegistrationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

const REGISTRATION_FAILED_RESPONSE = {
  code: "validation_failed",
  message: "the passkey registration did not verify against the backoffice's origin",
  details: [{ field: "passkey_registration" }],
} as const;

class CredentialAlreadyRegistered extends Error {}

export function registerPasskeyRegistrationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeyRegistrationRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);

  app.post(
    "/users/passkeys/registration-options",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const issuedAt = now();
      const openSession = openSessionOf(request);
      if (!(await requirePasskeyAuthorization(openSession, reply, issuedAt))) {
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
        registrationChallenge: registrationOptions.challenge,
        now: issuedAt,
      });

      await reply.code(200).send(
        passkeyRegistrationChallengeSchema.parse({
          passkey_registration_options: registrationOptions,
        }),
      );
    },
  );

  app.post(
    "/users/passkeys",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const body = await readValidatedBody(reply, passkeyRegistrationBodySchema, request.body);
      if (!body) {
        return;
      }
      const { passkey_name: passkeyName } = body;

      const pending = await consumePendingPasskeyChallenge(options.db, {
        sessionId: openSession.sessionId,
        kind: "registration",
        now: attemptedAt,
      });
      if (!pending?.registrationChallenge) {
        await reply.code(400).send(REGISTRATION_FAILED_RESPONSE);
        return;
      }

      const verification = await verifyRegistrationResponse({
        response: body.passkey_registration as RegistrationResponseJSON,
        expectedChallenge: pending.registrationChallenge,
        expectedOrigin: webAuthnConfig.expectedOrigin,
        expectedRPID: webAuthnConfig.rpID,
        requireUserVerification: true,
      }).catch(() => ({ verified: false as const }));
      if (!verification.verified) {
        await reply.code(400).send(REGISTRATION_FAILED_RESPONSE);
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

          await openAlert(
            tx,
            {
              kind: "backoffice_passkey_changed",
              scope: openSession.userId,
              detail: {
                action: "registered",
                passkeyName,
                actorId: openSession.userId,
                via: "self",
              },
            },
            { now },
          );

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
          code: "passkey_already_registered",
          message: "this passkey is already registered",
          details: [{ field: "passkey_registration" }],
        });
        return;
      }

      await reply.code(200).send(
        passkeySummarySchema.parse({
          id: inserted.id,
          name: passkeyName,
          created_at: inserted.createdAt.toISOString(),
          last_used_at: null,
        }),
      );
    },
  );
}
