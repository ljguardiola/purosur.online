import type { VoucherReference } from "@purosur/domain";
import {
  CREDIT_NOTE_C_DOCUMENT_TYPE,
  creditsItsInvoice,
  FACTURA_C_DOCUMENT_TYPE,
  FACTURA_C_VOUCHER_TYPE,
} from "@purosur/domain";
import { and, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { creditNotes, fiscalRequests, offlineFiscalDocuments } from "../platform/db/schema.js";
import { heldByTaxAuthority } from "./held-by-tax-authority.js";

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

export async function invoiceTotalHeld<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { voucherType, pointOfSale, number }: VoucherReference,
): Promise<number | null> {
  if (voucherType !== FACTURA_C_VOUCHER_TYPE) {
    return null;
  }
  const [realTime] = await db
    .select({ total: fiscalRequests.total })
    .from(fiscalRequests)
    .where(
      and(
        eq(fiscalRequests.pointOfSale, pointOfSale),
        eq(fiscalRequests.number, number),
        heldByTaxAuthority,
      ),
    )
    .limit(1);
  if (realTime !== undefined) {
    return realTime.total;
  }
  const [offline] = await db
    .select({ total: offlineFiscalDocuments.total })
    .from(offlineFiscalDocuments)
    .where(
      and(
        eq(offlineFiscalDocuments.documentType, FACTURA_C_DOCUMENT_TYPE),
        eq(offlineFiscalDocuments.pointOfSale, pointOfSale),
        eq(offlineFiscalDocuments.number, number),
      ),
    )
    .limit(1);
  return offline?.total ?? null;
}

export async function totalCreditedToInvoice<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { voucherType, pointOfSale, number }: VoucherReference,
  exceptOfflineDocumentId?: string,
): Promise<number> {
  const online = await db
    .select({ total: creditNotes.total, answerKind: creditNotes.answerKind })
    .from(creditNotes)
    .where(
      and(
        eq(creditNotes.associatedVoucherType, voucherType),
        eq(creditNotes.associatedPointOfSale, pointOfSale),
        eq(creditNotes.associatedNumber, number),
      ),
    );
  const [offline] = await db
    .select({ total: sql<string>`coalesce(sum(${offlineFiscalDocuments.total}), 0)` })
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
    );
  return (
    online
      .filter(({ answerKind }) => creditsItsInvoice(answerKind))
      .reduce((sum, { total }) => sum + total, 0) + Number(offline?.total ?? 0)
  );
}
