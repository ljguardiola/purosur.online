import { COUNTED_AS_ISSUED_STATE } from "@purosur/domain";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerFiscalAddressAssignments } from "../platform/db/schema.js";
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
  const assignmentInForce = db
    .select({ fiscalAddressId: registerFiscalAddressAssignments.fiscalAddressId })
    .from(registerFiscalAddressAssignments)
    .where(
      and(
        sql`${registerFiscalAddressAssignments.registerId}::text = ${issued.registerId}`,
        sql`${registerFiscalAddressAssignments.assignedAt} <= ${issued.issuedAt}`,
      ),
    )
    .orderBy(desc(registerFiscalAddressAssignments.assignedAt))
    .limit(1)
    .as("assignment_in_force");
  const fiscalAddressId = sql<string>`${assignmentInForce.fiscalAddressId}::text`;
  const month = sql<string>`left(${issued.issuedOn}, 7)`;
  return db
    .select({
      fiscalAddressId,
      month,
      exceptionCount: sql<number>`(count(*) filter (where ${issued.authorizationKind} = 'caea'))::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(issued)
    .innerJoinLateral(assignmentInForce, sql`true`)
    .where(and(eq(issued.state, COUNTED_AS_ISSUED_STATE), condition({ fiscalAddressId, month })))
    .groupBy(fiscalAddressId, month);
}
