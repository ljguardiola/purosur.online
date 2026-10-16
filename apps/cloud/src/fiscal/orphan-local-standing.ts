import { FACTURA_C_DOCUMENT_TYPE, FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import type {
  AuthorizationNumber,
  RequestsAtNumber,
  SaleDocument,
} from "@purosur/domain/fiscal/use-cases";
import { and, asc, eq, ne } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  fiscalRequests,
  fiscalTasks,
  offlineFiscalDocuments,
  orphanCreditNotes,
} from "../platform/db/schema.js";
import { answerOf, decisionOf } from "./fiscal-request-answer.js";

export async function otherDocumentsOfSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  saleId: string,
  excludedFiscalDocumentId: string,
): Promise<SaleDocument[]> {
  const offline = await db
    .select({
      pointOfSale: offlineFiscalDocuments.pointOfSale,
      number: offlineFiscalDocuments.number,
    })
    .from(offlineFiscalDocuments)
    .where(eq(offlineFiscalDocuments.saleId, saleId))
    .orderBy(asc(offlineFiscalDocuments.number));
  const realTime = await db
    .select()
    .from(fiscalRequests)
    .where(
      and(
        eq(fiscalRequests.saleId, saleId),
        ne(fiscalRequests.fiscalDocumentId, excludedFiscalDocumentId),
      ),
    )
    .orderBy(asc(fiscalRequests.number));
  return [
    ...offline.map(
      ({ pointOfSale, number }): SaleDocument => ({
        kind: "offline",
        voucher: { voucherType: FACTURA_C_VOUCHER_TYPE, pointOfSale, number },
      }),
    ),
    ...realTime.map(
      (row): SaleDocument => ({
        kind: "real_time",
        voucher: {
          voucherType: FACTURA_C_VOUCHER_TYPE,
          pointOfSale: row.pointOfSale,
          number: row.number,
        },
        outcome: { answer: answerOf(row), decision: decisionOf(row) },
      }),
    ),
  ];
}

export async function requestsAtNumber<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { pointOfSale, number }: AuthorizationNumber,
): Promise<RequestsAtNumber> {
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
  const rows = await db
    .select()
    .from(fiscalRequests)
    .where(and(eq(fiscalRequests.pointOfSale, pointOfSale), eq(fiscalRequests.number, number)))
    .orderBy(asc(fiscalRequests.receivedAt));
  return {
    kind: "requests",
    requests: rows.map((row) => ({
      fiscalDocumentId: row.fiscalDocumentId,
      saleId: row.saleId,
      issuedOn: row.issuedOn,
      total: row.total,
      buyerTaxStatusCode: row.buyerTaxStatusCode,
      answer: answerOf(row),
    })),
  };
}
