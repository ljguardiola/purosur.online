import {
  passkeyRegistrationBodySchema,
  passkeyRegistrationChallengeSchema,
  passkeySummarySchema,
} from "@purosur/contracts";
import {
  findAccountProfile,
  listPasskeyCredentials,
  registerPasskey,
} from "@purosur/domain/access/use-cases";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzleAccounts } from "./drizzle-accounts.js";
import { DrizzlePasskeyRegistrationStore } from "./drizzle-passkey-registration-store.js";
import { drizzlePasskeys } from "./drizzle-passkeys.js";
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

export function registerPasskeyRegistrationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeyRegistrationRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);

  app.post(
    "/account/passkey-challenges",
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

      const account = await findAccountProfile(
        { accounts: drizzleAccounts(options.db) },
        { userId: openSession.userId },
      );
      if (!account) {
        await reply.code(401).send(UNAUTHENTICATED_RESPONSE);
        return;
      }

      const existingPasskeys = await listPasskeyCredentials(
        { passkeys: drizzlePasskeys(options.db) },
        { userId: openSession.userId },
      );

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
    "/account/passkeys",
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

      const registered = await registerPasskey(
        { store: new DrizzlePasskeyRegistrationStore(options.db) },
        {
          userId: openSession.userId,
          passkey: {
            credentialId: registrationInfo.credential.id,
            publicKey: Buffer.from(registrationInfo.credential.publicKey).toString("base64url"),
            counter: registrationInfo.credential.counter,
            transports: registrationInfo.credential.transports ?? null,
            deviceType: registrationInfo.credentialDeviceType,
            backedUp: registrationInfo.credentialBackedUp,
            name: passkeyName,
          },
          at: attemptedAt,
        },
      );
      if (registered.kind === "passkey_already_registered") {
        await reply.code(400).send({
          code: "passkey_already_registered",
          message: "this passkey is already registered",
          details: [{ field: "passkey_registration" }],
        });
        return;
      }

      await reply.code(200).send(
        passkeySummarySchema.parse({
          id: registered.passkey.id,
          name: registered.passkey.name,
          created_at: registered.passkey.createdAt.toISOString(),
          last_used_at: null,
        }),
      );
    },
  );
}
