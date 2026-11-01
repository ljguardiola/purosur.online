import { COUNTED_AS_ISSUED_STATE } from "@purosur/domain";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerPointsOfSale } from "../platform/db/schema.js";
import { issuedDocuments } from "./drizzle-issued-fiscal-documents-reader.js";

interface StoredMonthlyVoucherCounts {
  fiscalAddressId: string;
  month: string;
  exceptionCount: number;
  totalCount: number;
}

export async function monthlyVoucherCounts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  condition: (columns: { fiscalAddressId: SQL<string>; month: SQL<string> }) => SQL,
): Promise<StoredMonthlyVoucherCounts[]> {
  const issued = issuedDocuments(db);
  const fiscalAddressId = sql<string>`${registerPointsOfSale.fiscalAddressId}::text`;
  const month = sql<string>`left(${issued.issuedOn}, 7)`;
  return db
    .select({
      fiscalAddressId,
      month,
      exceptionCount: sql<number>`(count(*) filter (where ${issued.authorizationKind} = 'caea'))::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(issued)
    .innerJoin(
      registerPointsOfSale,
      sql`${registerPointsOfSale.registerId}::text = ${issued.registerId}`,
    )
    .where(and(eq(issued.state, COUNTED_AS_ISSUED_STATE), condition({ fiscalAddressId, month })))
    .groupBy(fiscalAddressId, month);
}
