import { FACTURA_C_DOCUMENT_TYPE, FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import type {
  AuthorizationNumber,
  LocalStanding,
  VoucherReference,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, ne, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  fiscalRequests,
  fiscalTasks,
  offlineFiscalDocuments,
  orphanCreditNotes,
} from "../platform/db/schema.js";

export async function otherAuthorizedVoucherOfSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  saleId: string,
  excludedFiscalDocumentId: string,
): Promise<VoucherReference | null> {
  const [offline] = await db
    .select({
      pointOfSale: offlineFiscalDocuments.pointOfSale,
      number: offlineFiscalDocuments.number,
    })
    .from(offlineFiscalDocuments)
    .where(eq(offlineFiscalDocuments.saleId, saleId));
  if (offline !== undefined) {
    return { voucherType: FACTURA_C_VOUCHER_TYPE, ...offline };
  }
  const [other] = await db
    .select({ pointOfSale: fiscalRequests.pointOfSale, number: fiscalRequests.number })
    .from(fiscalRequests)
    .where(
      and(
        eq(fiscalRequests.saleId, saleId),
        ne(fiscalRequests.fiscalDocumentId, excludedFiscalDocumentId),
        or(eq(fiscalRequests.answerKind, "authorized"), eq(fiscalRequests.decision, "adopted")),
      ),
    )
    .orderBy(asc(fiscalRequests.number))
    .limit(1);
  return other === undefined ? null : { voucherType: FACTURA_C_VOUCHER_TYPE, ...other };
}

export async function localStandingOfAuthorization<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { pointOfSale, number }: AuthorizationNumber,
): Promise<LocalStanding> {
  const [creditNote] = await db
    .select({ id: orphanCreditNotes.id })
    .from(orphanCreditNotes)
    .where(
      and(
        eq(orphanCreditNotes.pointOfSale, pointOfSale),
        eq(orphanCreditNotes.associatedVoucherType, FACTURA_C_VOUCHER_TYPE),
        eq(orphanCreditNotes.associatedNumber, number),
      ),
    );
  const [task] = await db
    .select({ id: fiscalTasks.id })
    .from(fiscalTasks)
    .where(
      and(
        eq(fiscalTasks.kind, "external_invoicing"),
        eq(fiscalTasks.pointOfSale, pointOfSale),
        eq(fiscalTasks.documentType, FACTURA_C_DOCUMENT_TYPE),
        eq(fiscalTasks.number, number),
      ),
    );
  if (creditNote !== undefined || task !== undefined) {
    return { kind: "already_regularized" };
  }
  const [request] = await db
    .select({ saleId: fiscalRequests.saleId, fiscalDocumentId: fiscalRequests.fiscalDocumentId })
    .from(fiscalRequests)
    .where(and(eq(fiscalRequests.pointOfSale, pointOfSale), eq(fiscalRequests.number, number)))
    .orderBy(asc(fiscalRequests.receivedAt))
    .limit(1);
  if (request === undefined) {
    return { kind: "no_local_sale" };
  }
  return {
    kind: "local_sale",
    saleId: request.saleId,
    otherAuthorizedVoucher: await otherAuthorizedVoucherOfSale(
      db,
      request.saleId,
      request.fiscalDocumentId,
    ),
  };
}
