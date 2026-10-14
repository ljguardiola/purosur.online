import {
  pointTerminalAssignmentBodySchema,
  pointTerminalAssignmentSchema,
} from "@purosur/contracts";
import { assignPointTerminal } from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
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
import { DrizzlePointTerminalAssignmentStore } from "./drizzle-point-terminal-assignment-store.js";

export interface RegisterPointTerminalRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

const REGISTER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no register with that id belongs to this branch",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this register's Point terminal was changed since it was loaded",
} as const;

const POINT_TERMINAL_TAKEN_RESPONSE = {
  code: "point_terminal_taken",
  message: "that Point terminal is already assigned to another register",
  details: [{ field: "terminal_id" }],
} as const;

const INVALID_TERMINAL_ID_RESPONSE = {
  code: "validation_failed",
  message: "terminal_id must be a Point terminal id without spaces",
  details: [{ field: "terminal_id" }],
} as const;

export function registerRegisterPointTerminalRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegisterPointTerminalRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzlePointTerminalAssignmentStore(options.db, now);

  app.put(
    "/registers/:id/point-terminal",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);

      const body = await readValidatedBody(reply, pointTerminalAssignmentBodySchema, request.body);
      if (!body) {
        return;
      }

      const outcome = await assignPointTerminal(store, {
        locationId: openSession.locationId,
        registerId: ids.id,
        terminalId: body.terminal_id,
        version: body.version,
        actorId: openSession.userId,
      });

      switch (outcome.kind) {
        case "register_not_found":
          await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
          return;
        case "stale_version":
          await reply.code(409).send(STALE_VERSION_RESPONSE);
          return;
        case "terminal_taken":
          await reply.code(409).send(POINT_TERMINAL_TAKEN_RESPONSE);
          return;
        case "invalid_terminal_id":
          await reply.code(400).send(INVALID_TERMINAL_ID_RESPONSE);
          return;
        case "assigned":
        case "unchanged":
          await reply.code(200).send(
            pointTerminalAssignmentSchema.parse({
              register_id: ids.id,
              terminal_id: outcome.assignment.terminalId,
              version: outcome.assignment.version,
            }),
          );
          return;
      }
    },
  );
}
