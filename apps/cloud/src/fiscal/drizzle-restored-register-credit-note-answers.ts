import { CREDIT_NOTE_C_DOCUMENT_TYPE } from "@purosur/domain";
import type {
  IssuedOfflineCreditNoteOfRegister,
  KeptAlreadyCreditedRefusalOfRegister,
  RestoredRegisterCreditNoteAnswers,
  SaleVoidCreditNoteOfRegister,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  creditNotes,
  offlineFiscalDocuments,
  saleVoidCreditNoteRefusals,
} from "../platform/db/schema.js";
import { creditNoteOf } from "./drizzle-credit-notes.js";

export class DrizzleRestoredRegisterCreditNoteAnswers<TQueryResult extends PgQueryResultHKT>
  implements RestoredRegisterCreditNoteAnswers
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async saleVoidCreditNotesOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<SaleVoidCreditNoteOfRegister[]> {
    const rows = await this.db
      .select()
      .from(creditNotes)
      .where(
        and(
          eq(creditNotes.registerId, registerId),
          eq(creditNotes.reason, "sale_void"),
          inArray(creditNotes.id, [...creditNoteIds]),
        ),
      )
      .orderBy(creditNotes.createdAt, creditNotes.id);
    return rows.map((row) => {
      const { pointOfSale, standing } = creditNoteOf(row);
      return {
        creditNoteId: row.id,
        pointOfSale,
        standing,
        answeredAt: row.answeredAt,
      };
    });
  }

  async keptRefusalsOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<KeptAlreadyCreditedRefusalOfRegister[]> {
    return this.db
      .select({
        creditNoteId: saleVoidCreditNoteRefusals.creditNoteId,
        refusedAt: saleVoidCreditNoteRefusals.refusedAt,
      })
      .from(saleVoidCreditNoteRefusals)
      .where(
        and(
          eq(saleVoidCreditNoteRefusals.registerId, registerId),
          inArray(saleVoidCreditNoteRefusals.creditNoteId, [...creditNoteIds]),
        ),
      );
  }

  async issuedOfflineOf(
    registerId: string,
    creditNoteIds: readonly string[],
  ): Promise<IssuedOfflineCreditNoteOfRegister[]> {
    const rows = await this.db
      .select()
      .from(offlineFiscalDocuments)
      .where(
        and(
          eq(offlineFiscalDocuments.registerId, registerId),
          eq(offlineFiscalDocuments.documentType, CREDIT_NOTE_C_DOCUMENT_TYPE),
          inArray(offlineFiscalDocuments.creditNoteId, [...creditNoteIds]),
        ),
      );
    return rows.flatMap((row) =>
      row.creditNoteId === null
        ? []
        : [
            {
              creditNoteId: row.creditNoteId,
              pointOfSale: row.pointOfSale,
              number: row.number,
              issuedOn: row.issuedOn,
              issuedAt: row.generatedAt,
              offlineAuthorizationCode: row.offlineAuthorizationCode,
              fortnight: { start: row.fortnightStart, end: row.fortnightEnd },
            },
          ],
    );
  }
}
