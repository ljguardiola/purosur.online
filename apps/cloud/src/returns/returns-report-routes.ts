import { returnsReportQuerySchema, returnsReportSchema } from "@purosur/contracts";
import type {
  ReturnRow,
  ReturnsGroup,
  ReturnsReportTotals,
  VoidedSaleRecord,
  ZoneRulesSource,
} from "@purosur/domain";
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
  zoneRules: ZoneRulesSource;
  now: () => Date;
}

const person = ({ id, name }: { id: string; name: string | null }) => ({ id, name });

const invoiceOnTheWire = (invoice: { pointOfSale: number; number: number } | null) =>
  invoice === null ? null : { point_of_sale: invoice.pointOfSale, number: invoice.number };

const saleOnTheWire = (sale: ReturnRow["sale"]) => ({
  id: sale.id,
  operation_number: sale.operationNumber,
  invoice: invoiceOnTheWire(sale.invoice),
});

const optionalPerson = (value: { id: string; name: string | null } | null) =>
  value === null ? null : person(value);

function rowOnTheWire(row: ReturnRow) {
  return {
    return_id: row.returnId,
    occurred_at: row.occurredAt.toISOString(),
    register: row.register,
    sale: saleOnTheWire(row.sale),
    cashier: person(row.cashier),
    authorizer: optionalPerson(row.authorizer),
    lines: row.lines.map((line) => ({
      sale_line_id: line.saleLineId,
      product_name: line.productName,
      sale_unit: line.saleUnit,
      quantity: line.quantity,
      reason: line.reason,
      disposition: line.disposition,
      resolution: line.resolution,
      refunded: line.refunded,
    })),
    refunded: row.refunded,
  };
}

function groupOnTheWire(group: ReturnsGroup) {
  return { rows: group.rows.map(rowOnTheWire), totals: group.totals };
}

function voidOnTheWire(record: VoidedSaleRecord) {
  return {
    sale: saleOnTheWire(record.sale),
    voided_at: record.voidedAt.toISOString(),
    register: record.register,
    cashier: optionalPerson(record.cashier),
    authorizer: optionalPerson(record.authorizer),
    total: record.total,
  };
}

function summaryOnTheWire(totals: ReturnsReportTotals) {
  return {
    voids: totals.voids,
    voided: totals.voided,
    returns: totals.returns,
    refunded: totals.refunded,
    refunded_lines: totals.refundedLines,
    exchanged_lines: totals.exchangedLines,
    typed_returns: totals.typedReturns,
  };
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
        { reader, clock: { now }, zoneRules: options.zoneRules },
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
          voids: { rows: report.voids.rows.map(voidOnTheWire), totals: report.voids.totals },
          totals: summaryOnTheWire(report.totals),
          by_cashier: report.byCashier.map(({ cashier, ...totals }) => ({
            cashier: optionalPerson(cashier),
            ...summaryOnTheWire(totals),
          })),
          by_authorizer: report.byAuthorizer.map(({ authorizer, ...totals }) => ({
            authorizer: optionalPerson(authorizer),
            ...summaryOnTheWire(totals),
          })),
        }),
      );
    },
  );
}
