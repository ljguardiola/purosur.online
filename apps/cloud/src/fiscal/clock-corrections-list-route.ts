import { clockCorrectionListSchema } from "@purosur/contracts";
import type { BranchClockCorrection } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleClockCorrectionReader } from "./drizzle-clock-correction-reader.js";

export interface ClockCorrectionsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

function toWire(correction: BranchClockCorrection) {
  return {
    id: correction.eventId,
    corrected_at: correction.correctedAt.toISOString(),
    register_id: correction.registerId,
    register_name: correction.registerName,
    point_of_sale_number: correction.pointOfSale,
    document_type: correction.documentType,
    actor_id: correction.actorId,
    actor_first_name: correction.actorFirstName,
    previous_reading: correction.previousReading.toISOString(),
    previous_reading_source: correction.previousReadingSource,
    corrected_reading: correction.correctedReading.toISOString(),
    alert_state: correction.alertState,
  };
}

export function registerClockCorrectionsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ClockCorrectionsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleClockCorrectionReader(options.db);

  app.get(
    "/registers/clock-corrections",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const listed = await reader.listBranchClockCorrections(openSessionOf(request).locationId);
      await reply.code(200).send(clockCorrectionListSchema.parse(listed.map(toWire)));
    },
  );
}
