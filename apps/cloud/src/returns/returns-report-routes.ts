import { returnsReportQuerySchema, returnsReportSchema } from "@purosur/contracts";
import type { ReturnRow, ReturnsGroup } from "@purosur/domain";
import { readReturnsReport } from "@purosur/domain/returns/use-cases";
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
import { DrizzleReturnsReportReader } from "./drizzle-returns-report-reader.js";

export interface ReturnsReportRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

const person = ({ id, name }: { id: string; name: string | null }) => ({ id, name });

function rowOnTheWire(row: ReturnRow) {
  return {
    return_id: row.returnId,
    occurred_at: row.occurredAt.toISOString(),
    register: row.register,
    sale: {
      id: row.sale.id,
      operation_number: row.sale.operationNumber,
      invoice:
        row.sale.invoice === null
          ? null
          : { point_of_sale: row.sale.invoice.pointOfSale, number: row.sale.invoice.number },
    },
    cashier: person(row.cashier),
    authorizer: row.authorizer === null ? null : person(row.authorizer),
    lines: row.lines.map((line) => ({
      sale_line_id: line.saleLineId,
      product_name: line.productName,
      sale_unit: line.saleUnit,
      quantity: line.quantity,
      reason: line.reason,
      disposition: line.disposition,
      refunded: line.refunded,
    })),
    refunded: row.refunded,
  };
}

function groupOnTheWire(group: ReturnsGroup) {
  return { rows: group.rows.map(rowOnTheWire), totals: group.totals };
}

export function registerReturnsReportRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: ReturnsReportRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleReturnsReportReader(options.db);

  app.get(
    "/reports/returns",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("returns_report"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, returnsReportQuerySchema, request.query);
      if (!query) {
        return;
      }
      const report = await readReturnsReport(
        { reader, clock: { now } },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
        },
      );
      await reply.code(200).send(
        returnsReportSchema.parse({
          range: report.range,
          typed: groupOnTheWire(report.typed),
          scanned: groupOnTheWire(report.scanned),
        }),
      );
    },
  );
}
