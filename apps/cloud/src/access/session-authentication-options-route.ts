import { sessionAuthenticationOptionsSchema } from "@purosur/contracts";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { requireBackofficeOrigin } from "./backoffice-origin.js";
import { PUBLIC_ACCESS, registerRouteAccess } from "./route-access.js";
import { pruneExpiredSignInChallenges, storeSignInChallenge } from "./sign-in-challenge.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface SessionAuthenticationOptionsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

const AUTHENTICATION_TIMEOUT_MS = 60_000;

/** No `allowCredentials`, so the browser lets the person pick their own account (discoverable credential). */
export function registerSessionAuthenticationOptionsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionAuthenticationOptionsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);

  app.post(
    "/authentication-challenges",
    { config: { access: PUBLIC_ACCESS } },
    async (request, reply) => {
      if (!requireBackofficeOrigin(request, reply, options.backofficeOrigin)) {
        return;
      }

      const issuedAt = now();
      await pruneExpiredSignInChallenges(options.db, issuedAt);

      const authenticationOptions = await generateAuthenticationOptions({
        rpID: webAuthnConfig.rpID,
        allowCredentials: [],
        userVerification: "required",
        timeout: AUTHENTICATION_TIMEOUT_MS,
      });
      await storeSignInChallenge(options.db, {
        challenge: authenticationOptions.challenge,
        now: issuedAt,
      });

      await reply.code(200).send(
        sessionAuthenticationOptionsSchema.parse({
          passkey_authentication_options: authenticationOptions,
        }),
      );
    },
  );
}
