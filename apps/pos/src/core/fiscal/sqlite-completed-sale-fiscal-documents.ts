import type { FiscalDocumentState } from "@purosur/domain";
import type {
  CompletedSaleFiscalDocument,
  CompletedSaleFiscalDocuments,
} from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { saleTotalOf } from "../sales/sqlite-sale-total";

export class SqliteCompletedSaleFiscalDocuments implements CompletedSaleFiscalDocuments {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  documentsIn(states: readonly FiscalDocumentState[]): CompletedSaleFiscalDocument[] {
    return this.database
      .prepare<string[], { id: string; sale_id: string; occurred_at: string }>(
        `SELECT fiscal_documents.id, fiscal_documents.sale_id, sales.occurred_at
         FROM fiscal_documents JOIN sales ON sales.id = fiscal_documents.sale_id
         WHERE fiscal_documents.state IN (${states.map(() => "?").join(", ")})
           AND sales.state = 'COMPLETED'
         ORDER BY sales.occurred_at, fiscal_documents.rowid`,
      )
      .all(...states)
      .map((row) => ({
        id: row.id,
        saleId: row.sale_id,
        completedAt: new Date(row.occurred_at),
        total: saleTotalOf(this.database, row.sale_id),
      }));
  }
}
