import type { VoucherReference } from "@purosur/domain";
import { CREDIT_NOTE_C_DOCUMENT_TYPE } from "@purosur/domain";
import { and, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { creditNotes, offlineFiscalDocuments } from "../platform/db/schema.js";

export function creditedVoucherLockKey({ voucherType, pointOfSale, number }: VoucherReference) {
  return `credited_voucher:${voucherType}:${pointOfSale}:${number}`;
}

export async function lockCreditedVoucher<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  voucher: VoucherReference,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${creditedVoucherLockKey(voucher)}, 0))`,
  );
}

export async function voucherCreditedOnline<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { voucherType, pointOfSale, number }: VoucherReference,
): Promise<boolean> {
  const [credit] = await db
    .select({ id: creditNotes.id })
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.associatedVoucherType, voucherType),
        eq(creditNotes.associatedPointOfSale, pointOfSale),
        eq(creditNotes.associatedNumber, number),
      ),
    )
    .limit(1);
  return credit !== undefined;
}

export async function voucherCreditedOffline<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { voucherType, pointOfSale, number }: VoucherReference,
  exceptOfflineDocumentId?: string,
): Promise<boolean> {
  const [credit] = await db
    .select({ id: offlineFiscalDocuments.id })
    .from(offlineFiscalDocuments)
    .where(
      and(
        eq(offlineFiscalDocuments.documentType, CREDIT_NOTE_C_DOCUMENT_TYPE),
        eq(offlineFiscalDocuments.correctedVoucherType, voucherType),
        eq(offlineFiscalDocuments.correctedPointOfSale, pointOfSale),
        eq(offlineFiscalDocuments.correctedNumber, number),
        ...(exceptOfflineDocumentId === undefined
          ? []
          : [ne(offlineFiscalDocuments.id, exceptOfflineDocumentId)]),
      ),
    )
    .limit(1);
  return credit !== undefined;
}
