import { COUNTED_AS_ISSUED_STATE, fiscalAddressAt } from "@purosur/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { issuedDocuments } from "./drizzle-issued-fiscal-documents-reader.js";
import {
  fiscalAddressHistories,
  historyOf,
  registersEverAt,
} from "./drizzle-register-fiscal-address-histories.js";

interface StoredMonthlyVoucherCounts {
  fiscalAddressId: string;
  month: string;
  exceptionCount: number;
  totalCount: number;
}

export interface VoucherCountsQuery {
  months: { from: string; through: string };
  fiscalAddressId?: string;
}

export async function monthlyVoucherCounts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { months, fiscalAddressId }: VoucherCountsQuery,
): Promise<StoredMonthlyVoucherCounts[]> {
  const issued = issuedDocuments(db);
  const month = sql<string>`left(${issued.issuedOn}, 7)`;
  const documents = await db
    .select({
      registerId: issued.registerId,
      issuedAt: sql<Date>`${issued.issuedAt}`.mapWith((stored: string | Date) => new Date(stored)),
      month,
      exception: sql<boolean>`${issued.authorizationKind} is not distinct from 'caea'`,
    })
    .from(issued)
    .where(
      and(
        eq(issued.state, COUNTED_AS_ISSUED_STATE),
        sql`${month} between ${months.from} and ${months.through}`,
        fiscalAddressId === undefined
          ? undefined
          : inArray(sql`${issued.registerId}::uuid`, registersEverAt(db, fiscalAddressId)),
      ),
    );
  const histories = await fiscalAddressHistories(db, fiscalAddressId);
  const counts = new Map<string, StoredMonthlyVoucherCounts>();
  for (const document of documents) {
    const attributedTo = fiscalAddressAt(
      document.issuedAt,
      historyOf(histories, document.registerId),
    );
    if (
      attributedTo === null ||
      (fiscalAddressId !== undefined && attributedTo !== fiscalAddressId)
    ) {
      continue;
    }
    const key = JSON.stringify([attributedTo, document.month]);
    const count = counts.get(key) ?? {
      fiscalAddressId: attributedTo,
      month: document.month,
      exceptionCount: 0,
      totalCount: 0,
    };
    count.totalCount += 1;
    count.exceptionCount += document.exception ? 1 : 0;
    counts.set(key, count);
  }
  return [...counts.values()];
}
