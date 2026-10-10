import { releaseQuarantinedEventErrorSchema } from "@purosur/contracts/sync/quarantined-events";
import { releaseQuarantinedEvent } from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleQuarantineRelease } from "./drizzle-quarantine-release.js";
import type { QuarantinedEventsRouteOptions } from "./quarantined-events-list-route.js";

const NOT_FOUND_RESPONSE = releaseQuarantinedEventErrorSchema.parse({
  code: "not_found",
  message: "no event with that id was received from a register of this branch",
});

const NOT_QUARANTINED_RESPONSE = releaseQuarantinedEventErrorSchema.parse({
  code: "not_quarantined",
  message: "this event is not in quarantine",
});

export function registerQuarantinedEventReleaseRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: QuarantinedEventsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const ports = { quarantineRelease: new DrizzleQuarantineRelease(options.db), clock: { now } };

  app.post(
    "/synced-events/:eventId/release",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("quarantined_events"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["eventId"]);
      if (!ids) {
        return;
      }
      const session = openSessionOf(request);

      const outcome = await releaseQuarantinedEvent(ports, {
        eventId: ids.eventId,
        locationId: session.locationId,
        releasedBy: session.userId,
      });
      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "not_quarantined") {
        await reply.code(409).send(NOT_QUARANTINED_RESPONSE);
        return;
      }
      await reply.code(204).send();
    },
  );
}
