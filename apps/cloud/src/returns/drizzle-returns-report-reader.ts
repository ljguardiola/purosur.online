import {
  ARGENTINA_TIME_ZONE,
  RETURN_DISPOSITIONS,
  RETURN_REASONS,
  type ReturnRecord,
  type ReturnRecordLine,
  saleUnitOfWeightSource,
  TICKET_SOURCES,
  WEIGHT_SOURCES,
  type WeightSource,
} from "@purosur/domain";
import type { ReturnsReportQuery, ReturnsReportReader } from "@purosur/domain/returns/use-cases";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import {
  fiscalRequests,
  offlineFiscalDocuments,
  registers,
  returnLines,
  saleLines,
  saleReturns,
  sales,
  users,
} from "../platform/db/schema.js";

const returnDay = sql<string>`to_char(${saleReturns.occurredAt} at time zone ${ARGENTINA_TIME_ZONE}, 'YYYY-MM-DD')`;

function known<T extends string>(options: readonly T[], stored: string, what: string): T {
  const found = options.find((option) => option === stored);
  if (found === undefined) {
    throw new Error(`A stored return has an unknown ${what}: ${stored}`);
  }
  return found;
}

function weightSourceOf(stored: string | null): WeightSource | null {
  return stored === null ? null : known(WEIGHT_SOURCES, stored, "weight source");
}

type Invoice = { pointOfSale: number; number: number };

export class DrizzleReturnsReportReader<TQueryResult extends PgQueryResultHKT>
  implements ReturnsReportReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  returnsMade(query: ReturnsReportQuery): Promise<ReturnRecord[]> {
    return this.db.transaction(async (tx) => returnsOf(tx, query), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  }
}

async function returnsOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { locationId, range, registerId }: ReturnsReportQuery,
): Promise<ReturnRecord[]> {
  const cashier = alias(users, "cashier");
  const authorizer = alias(users, "authorizer");
  const returns = await db
    .select({
      returnId: saleReturns.id,
      occurredAt: saleReturns.occurredAt,
      ticketSource: saleReturns.ticketSource,
      registerId: registers.id,
      registerName: registers.name,
      saleId: sales.id,
      operationNumber: sales.operationNumber,
      cashierId: saleReturns.actorId,
      cashierName: cashier.firstName,
      authorizerId: saleReturns.authorizedBy,
      authorizerName: authorizer.firstName,
    })
    .from(saleReturns)
    .innerJoin(sales, eq(sales.id, saleReturns.saleId))
    .innerJoin(registers, eq(registers.id, saleReturns.registerId))
    .leftJoin(cashier, sql`${cashier.id}::text = ${saleReturns.actorId}`)
    .leftJoin(authorizer, sql`${authorizer.id}::text = ${saleReturns.authorizedBy}`)
    .where(
      and(
        eq(sales.locationId, locationId),
        registerId === undefined ? undefined : eq(saleReturns.registerId, registerId),
        sql`${returnDay} >= ${range.from}`,
        sql`${returnDay} <= ${range.to}`,
      ),
    );
  if (returns.length === 0) {
    return [];
  }
  const linesByReturn = await linesOf(
    db,
    returns.map((row) => row.returnId),
  );
  const invoiceBySale = await invoicesOf(db, [...new Set(returns.map((row) => row.saleId))]);
  return returns.map((row) => ({
    returnId: row.returnId,
    occurredAt: row.occurredAt,
    ticketSource: known(TICKET_SOURCES, row.ticketSource, "ticket source"),
    register: { id: row.registerId, name: row.registerName },
    sale: {
      id: row.saleId,
      operationNumber: row.operationNumber,
      invoice: invoiceBySale.get(row.saleId) ?? null,
    },
    cashier: { id: row.cashierId, name: row.cashierName },
    authorizer:
      row.authorizerId === null ? null : { id: row.authorizerId, name: row.authorizerName },
    lines: linesByReturn.get(row.returnId) ?? [],
  }));
}

async function linesOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  returnIds: string[],
): Promise<Map<string, ReturnRecordLine[]>> {
  const rows = await db
    .select({
      returnId: returnLines.returnId,
      saleLineId: returnLines.saleLineId,
      productName: saleLines.productName,
      weightSource: saleLines.weightSource,
      quantity: returnLines.quantity,
      reason: returnLines.reason,
      disposition: returnLines.disposition,
      refunded: returnLines.refundedAmount,
    })
    .from(returnLines)
    .innerJoin(saleLines, eq(saleLines.id, returnLines.saleLineId))
    .where(inArray(returnLines.returnId, returnIds))
    .orderBy(asc(returnLines.id));
  const byReturn = new Map<string, ReturnRecordLine[]>();
  for (const row of rows) {
    const lines = byReturn.get(row.returnId) ?? [];
    lines.push({
      saleLineId: row.saleLineId,
      productName: row.productName,
      saleUnit: saleUnitOfWeightSource(weightSourceOf(row.weightSource)),
      quantity: row.quantity,
      reason: known(RETURN_REASONS, row.reason, "reason"),
      disposition: known(RETURN_DISPOSITIONS, row.disposition, "disposition"),
      refunded: row.refunded,
    });
    byReturn.set(row.returnId, lines);
  }
  return byReturn;
}

async function invoicesOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  saleIds: string[],
): Promise<Map<string, Invoice>> {
  const online = await db
    .select({
      saleId: fiscalRequests.saleId,
      pointOfSale: fiscalRequests.pointOfSale,
      number: fiscalRequests.number,
    })
    .from(fiscalRequests)
    .where(
      and(
        inArray(fiscalRequests.saleId, saleIds),
        or(eq(fiscalRequests.answerKind, "authorized"), eq(fiscalRequests.decision, "adopted")),
      ),
    );
  const offline = await db
    .select({
      saleId: offlineFiscalDocuments.saleId,
      pointOfSale: offlineFiscalDocuments.pointOfSale,
      number: offlineFiscalDocuments.number,
    })
    .from(offlineFiscalDocuments)
    .where(
      and(
        inArray(offlineFiscalDocuments.saleId, saleIds),
        eq(offlineFiscalDocuments.documentType, "factura_c"),
      ),
    );
  const bySale = new Map<string, Invoice>();
  for (const { saleId, pointOfSale, number } of [...offline, ...online]) {
    bySale.set(saleId, { pointOfSale, number });
  }
  return bySale;
}
