import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { resolveWebAuthnConfig } from "../recovery/webauthn-config.js";
import { PUBLIC_ACCESS, registerRouteAccess } from "./route-access.js";
import { pruneExpiredSignInChallenges, storeSignInChallenge } from "./sign-in-challenge.js";

export interface SessionAuthenticationOptionsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the issued challenge's stored lifetime is deterministic. */
  now?: () => Date;
}

const AUTHENTICATION_TIMEOUT_MS = 60_000;

/**
 * Registers `POST /users/session/authentication-options`: hands back WebAuthn request options for
 * a discoverable credential (no `allowCredentials`, so the browser lets the person pick their own
 * account) and stashes the challenge it generated so `POST /users/session/authenticate` can later
 * confirm the assertion answers a challenge this server actually issued.
 */
export function registerSessionAuthenticationOptionsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionAuthenticationOptionsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
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
    "/users/session/authentication-options",
    { config: { access: PUBLIC_ACCESS } },
    async (request, reply) => {
      if (!checkOrigin(request, reply)) {
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

      await reply.code(200).send({ passkey_authentication_options: authenticationOptions });
    },
  );
}
