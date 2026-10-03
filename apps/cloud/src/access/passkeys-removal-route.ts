import { removeOwnPasskey } from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { DrizzlePasskeyRemovalStore } from "./drizzle-passkey-removal-store.js";
import { AUTHORIZATION_REQUIRED_RESPONSE } from "./passkey-authorization-guard.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

export interface PasskeyRemovalRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no passkey with that id belongs to this account",
} as const;

export function registerPasskeyRemovalRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PasskeyRemovalRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete(
    "/account/passkeys/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const targetId = ids.id;

      const outcome = await removeOwnPasskey(
        { store: new DrizzlePasskeyRemovalStore(options.db) },
        {
          userId: openSession.userId,
          passkeyId: targetId,
          passkeyAuthorizedAt: openSession.passkeyAuthorizedAt,
          at: attemptedAt,
        },
      );
      if (outcome.kind === "authorization_required") {
        await reply.code(401).send(AUTHORIZATION_REQUIRED_RESPONSE);
        return;
      }
      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
