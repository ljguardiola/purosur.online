import type {
  KeptAlreadyCreditedRefusalOfRegister,
  RestoredRegisterCreditNoteAnswers,
  SaleVoidCreditNoteOfRegister,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { creditNotes, saleVoidCreditNoteRefusals } from "../platform/db/schema.js";
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
}
