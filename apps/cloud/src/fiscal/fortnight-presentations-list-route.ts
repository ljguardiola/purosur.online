import { fortnightPresentationListSchema } from "@purosur/contracts";
import { argentinaCalendarDay } from "@purosur/domain";
import type { BranchFortnightPresentation } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleFortnightPresentationReader } from "./drizzle-fortnight-presentation-reader.js";

export interface FortnightPresentationsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

function toRejectedDocumentWire(rejected: BranchFortnightPresentation["rejectedDocument"]) {
  return rejected === null
    ? null
    : {
        number: rejected.number,
        unprocessed: rejected.unprocessed,
        document_id: rejected.documentId,
        issued_on: rejected.issuedOn,
        total: rejected.total,
        buyer_document_type: rejected.buyerDocumentType,
        buyer_document_number: rejected.buyerDocumentNumber,
        buyer_tax_status_code: rejected.buyerTaxStatusCode,
        rejections: rejected.rejections,
        remedy: rejected.remedy,
      };
}

function toWire(presentation: BranchFortnightPresentation) {
  return {
    register_id: presentation.registerId,
    point_of_sale_number: presentation.pointOfSaleNumber,
    fortnight_start: presentation.fortnight.start,
    fortnight_end: presentation.fortnight.end,
    deadline: presentation.deadline,
    document_type: presentation.documentType,
    document_count: presentation.documentCount,
    rejected_document: toRejectedDocumentWire(presentation.rejectedDocument),
    movement: presentation.movement,
    refusal: presentation.refusal,
    state: presentation.state,
  };
}

export function registerFortnightPresentationsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FortnightPresentationsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleFortnightPresentationReader(options.db);

  app.get(
    "/registers/fortnight-presentations",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const listed = await reader.branchPresentations(
        openSessionOf(request).locationId,
        argentinaCalendarDay(now()),
      );
      await reply.code(200).send(fortnightPresentationListSchema.parse(listed.map(toWire)));
    },
  );
}
