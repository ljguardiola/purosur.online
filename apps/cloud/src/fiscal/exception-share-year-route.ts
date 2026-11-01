import { exceptionShareYearQuerySchema, exceptionShareYearSchema } from "@purosur/contracts";
import type { ZoneRulesSource } from "@purosur/domain";
import { readExceptionShareYear } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleExceptionShareYearReader } from "./drizzle-exception-share-year-reader.js";

export interface ExceptionShareYearRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  zoneRules: ZoneRulesSource;
  now: () => Date;
}

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no fiscal address with that id",
} as const;

export function registerExceptionShareYearRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ExceptionShareYearRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleExceptionShareYearReader(options.db);

  app.get(
    "/fiscal/exception-share/:fiscalAddressId",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("fiscal_information"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["fiscalAddressId"]);
      if (!ids) {
        return;
      }
      const query = await readValidatedBody(reply, exceptionShareYearQuerySchema, request.query);
      if (!query) {
        return;
      }
      const outcome = await readExceptionShareYear(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        { fiscalAddressId: ids.fiscalAddressId, year: query.year },
      );
      if (outcome.kind === "fiscal_address_not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      await reply.code(200).send(
        exceptionShareYearSchema.parse({
          fiscal_address: outcome.fiscalAddress,
          year: outcome.year,
          months: outcome.months.map((month) => ({
            month: month.month,
            exception_count: month.exceptionCount,
            total_count: month.totalCount,
            share_tenths_of_percent: month.shareTenthsOfPercent,
            state: month.state,
          })),
          non_compliant_months: outcome.nonCompliantMonths,
        }),
      );
    },
  );
}
