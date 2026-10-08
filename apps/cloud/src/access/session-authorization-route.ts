import {
  sessionAuthorizationBodySchema,
  sessionAuthorizationOptionsSchema,
} from "@purosur/contracts";
import {
  authorizeSession,
  consumePendingPasskeyChallenge,
  issuePendingPasskeyChallenge,
  listPasskeyCredentials,
} from "@purosur/domain/credentials/use-cases";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzlePasskeys } from "./drizzle-passkeys.js";
import { DrizzlePendingPasskeyChallengeStore } from "./drizzle-pending-passkey-challenge-store.js";
import { DrizzleSessionAuthorizationStore } from "./drizzle-session-authorization-store.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import { webAuthnAssertionVerifier } from "./webauthn-assertion-verifier.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface SessionAuthorizationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

const AUTHENTICATION_TIMEOUT_MS = 60_000;

const AUTHENTICATION_FAILED_RESPONSE = {
  code: "authentication_failed",
  message: "the passkey authorization could not be verified",
} as const;

export function registerSessionAuthorizationRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionAuthorizationRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);

  app.post(
    "/sessions/current/authorization-challenges",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const issuedAt = now();
      const openSession = openSessionOf(request);

      const existingPasskeys = await listPasskeyCredentials(
        { passkeys: drizzlePasskeys(options.db) },
        { userId: openSession.userId },
      );

      const authorizationOptions = await generateAuthenticationOptions({
        rpID: webAuthnConfig.rpID,
        allowCredentials: existingPasskeys.map((passkey) => ({
          id: passkey.credentialId,
          ...(passkey.transports ? { transports: passkey.transports } : {}),
        })),
        userVerification: "required",
        timeout: AUTHENTICATION_TIMEOUT_MS,
      });

      await issuePendingPasskeyChallenge(
        { store: new DrizzlePendingPasskeyChallengeStore(options.db) },
        {
          sessionId: openSession.sessionId,
          kind: "session_authorization",
          challenge: authorizationOptions.challenge,
          at: issuedAt,
        },
      );

      await reply
        .code(200)
        .send(
          sessionAuthorizationOptionsSchema.parse({ authorization_options: authorizationOptions }),
        );
    },
  );

  app.put(
    "/sessions/current/authorization",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const body = sessionAuthorizationBodySchema.safeParse(request.body);
      if (!body.success) {
        await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
        return;
      }
      const assertion = body.data.authorization as AuthenticationResponseJSON;

      const pending = await consumePendingPasskeyChallenge(
        { store: new DrizzlePendingPasskeyChallengeStore(options.db) },
        { sessionId: openSession.sessionId, kind: "session_authorization", at: attemptedAt },
      );
      if (pending.kind !== "consumed") {
        await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
        return;
      }

      const outcome = await authorizeSession(
        {
          passkeys: drizzlePasskeys(options.db),
          verifier: webAuthnAssertionVerifier({
            assertion,
            expectedChallenge: pending.challenge,
            config: webAuthnConfig,
          }),
          store: new DrizzleSessionAuthorizationStore(options.db),
        },
        {
          userId: openSession.userId,
          sessionId: openSession.sessionId,
          credentialId: assertion.id,
          at: attemptedAt,
        },
      );
      if (outcome.kind !== "authorized") {
        await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
