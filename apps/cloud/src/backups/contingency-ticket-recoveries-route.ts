import {
  contingencyTicketRecoveriesResponseSchema,
  contingencyTicketRecoveryFinishResponseSchema,
} from "@purosur/contracts";
import { finishContingencyTicketRecovery } from "@purosur/domain/backups/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleContingencyTicketRecoveries } from "./drizzle-contingency-ticket-recoveries.js";

export interface ContingencyTicketRecoveriesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerContingencyTicketRecoveriesRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ContingencyTicketRecoveriesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const recoveries = new DrizzleContingencyTicketRecoveries(options.db);
  const ports = { recoveries, clock: { now } };
  const routeConfig = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: {
      access: capabilityAccess("contingency_ticket_rescue"),
      sessionSource: routeSessionSource({ db: options.db, now }),
    },
  };

  app.get("/contingency-backup-tickets/recoveries", routeConfig, async (_request, reply) => {
    const awaiting = await recoveries.awaiting();
    await reply.code(200).send(
      contingencyTicketRecoveriesResponseSchema.parse({
        recoveries: awaiting.map((recovery) => ({
          recovery_id: recovery.recoveryId,
          register_id: recovery.registerId,
          register_name: recovery.registerName,
          opened_at: recovery.openedAt.toISOString(),
        })),
      }),
    );
  });

  app.post(
    "/contingency-backup-tickets/recoveries/:id/finish",
    routeConfig,
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const outcome = await finishContingencyTicketRecovery(ports, {
        recoveryId: ids.id,
        finishedBy: openSessionOf(request).userId,
      });
      await reply
        .code(200)
        .send(contingencyTicketRecoveryFinishResponseSchema.parse({ outcome: outcome.kind }));
    },
  );
}
