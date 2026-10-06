import { openSessionSchema } from "@purosur/contracts";
import {
  grantedCapabilities,
  mayEmitPinCode,
  sessionExpiresAt,
  visibleManualStockMovementKinds,
} from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "./backoffice-origin.js";
import {
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";

export interface SessionReadRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export function registerSessionReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SessionReadRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/sessions/current",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      await reply.code(200).send(
        openSessionSchema.parse({
          user_id: openSession.userId,
          display_name: openSession.firstName,
          expires_at: sessionExpiresAt(openSession).toISOString(),
          capabilities: grantedCapabilities(openSession),
          stock_movement_kinds: visibleManualStockMovementKinds(openSession),
          may_emit_own_pin_code: mayEmitPinCode(
            {
              id: openSession.userId,
              isAdministrator: openSession.isAdministrator,
              permissionKeys: openSession.permissionKeys,
            },
            { id: openSession.userId, isAdministrator: openSession.isAdministrator, active: true },
          ),
        }),
      );
    },
  );
}
