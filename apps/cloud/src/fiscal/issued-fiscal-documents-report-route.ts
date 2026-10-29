import {
  issuedFiscalDocumentsReportQuerySchema,
  issuedFiscalDocumentsReportSchema,
} from "@purosur/contracts";
import type { ZoneRulesSource } from "@purosur/domain";
import { readIssuedFiscalDocumentsReport } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleIssuedFiscalDocumentsReportReader } from "./drizzle-issued-fiscal-documents-report-reader.js";

export interface IssuedFiscalDocumentsReportRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  zoneRules: ZoneRulesSource;
  now: () => Date;
}

export function registerIssuedFiscalDocumentsReportRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: IssuedFiscalDocumentsReportRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleIssuedFiscalDocumentsReportReader(options.db);

  app.get(
    "/reports/fiscal-documents",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("reports_area"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(
        reply,
        issuedFiscalDocumentsReportQuerySchema,
        request.query,
      );
      if (!query) {
        return;
      }
      const report = await readIssuedFiscalDocumentsReport(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
        },
      );
      await reply.code(200).send(
        issuedFiscalDocumentsReportSchema.parse({
          range: report.range,
          rows: report.rows.map((row) => ({
            kind: row.kind,
            voucher_type: row.voucherType,
            point_of_sale: row.pointOfSale,
            authorization_kind: row.authorizationKind,
            count: row.count,
            amount: row.amount,
          })),
          totals: {
            receipts: report.totals.receipts,
            credit_notes: report.totals.creditNotes,
            amount: report.totals.amount,
            contingency: {
              count: report.totals.contingency.count,
              share_tenths_of_percent: report.totals.contingency.shareTenthsOfPercent,
            },
          },
        }),
      );
    },
  );
}
