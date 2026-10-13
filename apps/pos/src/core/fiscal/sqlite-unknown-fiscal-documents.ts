import type { LocalDatabase } from "../platform/local-database";
import { saleTotalOf } from "../sales/sqlite-sale-total";

export interface UnknownFiscalDocument {
  id: string;
  saleId: string;
  completedAt: Date;
  total: number;
}

export function readUnknownFiscalDocuments(database: LocalDatabase): UnknownFiscalDocument[] {
  return database
    .prepare<[], { id: string; sale_id: string; occurred_at: string }>(
      `SELECT fiscal_documents.id, fiscal_documents.sale_id, sales.occurred_at
       FROM fiscal_documents JOIN sales ON sales.id = fiscal_documents.sale_id
       WHERE fiscal_documents.state = 'UNKNOWN' AND sales.state = 'COMPLETED'
       ORDER BY sales.occurred_at, fiscal_documents.rowid`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      saleId: row.sale_id,
      completedAt: new Date(row.occurred_at),
      total: saleTotalOf(database, row.sale_id),
    }));
}
