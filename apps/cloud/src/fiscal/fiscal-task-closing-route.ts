import { fiscalTaskClosingBodySchema } from "@purosur/contracts";
import { closeFiscalTask } from "@purosur/domain/fiscal/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleFiscalTaskClosingStore } from "./drizzle-fiscal-task-closing-store.js";
import type { FiscalTasksRouteOptions } from "./fiscal-tasks-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no fiscal task of this branch has that id",
} as const;

const ALREADY_CLOSED_RESPONSE = {
  code: "already_closed",
  message: "this fiscal task was already closed",
} as const;

export function registerFiscalTaskClosingRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FiscalTasksRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const closingPorts = { store: new DrizzleFiscalTaskClosingStore(options.db), clock: { now } };

  app.put(
    "/fiscal/tasks/:id/closure",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("close_fiscal_tasks"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const body = await readValidatedBody(reply, fiscalTaskClosingBodySchema, request.body);
      if (!body) {
        return;
      }
      const openSession = openSessionOf(request);

      const outcome = await closeFiscalTask(closingPorts, {
        taskId: ids.id,
        locationId: openSession.locationId,
        closedBy: openSession.userId,
        note: body.note,
      });
      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "already_closed") {
        await reply.code(409).send(ALREADY_CLOSED_RESPONSE);
        return;
      }
      await reply.code(204).send();
    },
  );
}
