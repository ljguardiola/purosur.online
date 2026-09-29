import {
  sessionAuthorizationBodySchema,
  sessionAuthorizationOptionsSchema,
} from "@purosur/contracts";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { passkeys, sessions } from "../platform/db/schema.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import {
  consumePendingPasskeyChallenge,
  pruneExpiredPasskeyChallenges,
  storePendingPasskeyChallenge,
} from "./passkey-challenge.js";
import { verifyPasskeyReauthentication } from "./passkey-reauthentication.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface SessionAuthorizationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
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
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);

  app.post(
    "/users/session/authorization-options",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const issuedAt = now();
      const openSession = openSessionOf(request);

      const existingPasskeys = await options.db
        .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
        .from(passkeys)
        .where(eq(passkeys.userId, openSession.userId));

      const authorizationOptions = await generateAuthenticationOptions({
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
        kind: "session_authorization",
        reauthenticationChallenge: authorizationOptions.challenge,
        now: issuedAt,
      });

      await reply
        .code(200)
        .send(
          sessionAuthorizationOptionsSchema.parse({ authorization_options: authorizationOptions }),
        );
    },
  );

  app.post(
    "/users/session/authorization",
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

      const pending = await consumePendingPasskeyChallenge(options.db, {
        sessionId: openSession.sessionId,
        kind: "session_authorization",
        now: attemptedAt,
      });
      if (!pending?.reauthenticationChallenge) {
        await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
        return;
      }

      const authorization = await verifyPasskeyReauthentication(options.db, {
        userId: openSession.userId,
        assertion,
        expectedChallenge: pending.reauthenticationChallenge,
        webAuthnConfig,
        now: attemptedAt,
      });
      if (!authorization.verified) {
        await reply.code(401).send(AUTHENTICATION_FAILED_RESPONSE);
        return;
      }

      await options.db
        .update(sessions)
        .set({ passkeyAuthorizedAt: attemptedAt })
        .where(eq(sessions.id, openSession.sessionId));

      await reply.code(200).send();
    },
  );
}
