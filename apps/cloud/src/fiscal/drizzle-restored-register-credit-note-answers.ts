import type {
  RestoredRegisterCreditNoteAnswers,
  SaleVoidCreditNoteOfRegister,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { creditNotes } from "../platform/db/schema.js";
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
    saleIds: readonly string[],
  ): Promise<SaleVoidCreditNoteOfRegister[]> {
    const rows = await this.db
      .select()
      .from(creditNotes)
      .where(
        and(
          eq(creditNotes.registerId, registerId),
          eq(creditNotes.reason, "sale_void"),
          inArray(creditNotes.saleId, [...saleIds]),
        ),
      )
      .orderBy(creditNotes.createdAt, creditNotes.id);
    return rows.map((row) => {
      const { pointOfSale, standing } = creditNoteOf(row);
      return {
        saleId: row.saleId,
        creditNoteId: row.id,
        pointOfSale,
        standing,
        answeredAt: row.answeredAt,
      };
    });
  }
}
