import { type DeferredSaleFacts, latestIssuedOn } from "@purosur/domain";
import type { DeferredSaleLookup, DeferredSaleSearch } from "@purosur/domain/sales/use-cases";
import { readRealTimeSeries } from "../fiscal/sqlite-fiscal-series";
import type { LocalDatabase } from "../platform/local-database";

interface DeferredSaleFactsRow {
  deferred_sale_id: string;
  sale_id: string;
  occurred_at: string;
  total: number;
  short_code: string;
  cancelled: 0 | 1;
  sale_voided: 0 | 1;
  point_of_sale: number | null;
  number: number | null;
  original_print_attempted: 0 | 1;
}

const FACTS_SELECT = `SELECT deferred_sales.id AS deferred_sale_id, deferred_sales.sale_id,
         deferred_sales.occurred_at, deferred_sales.total, deferred_sales.short_code,
         (deferred_sales.cancelled_at IS NOT NULL) AS cancelled,
         (sales.state = 'VOIDED') AS sale_voided,
         fiscal_documents.point_of_sale, fiscal_documents.number,
         EXISTS (SELECT 1 FROM deferred_invoice_prints
                  WHERE deferred_invoice_prints.sale_id = deferred_sales.sale_id) AS original_print_attempted
  FROM deferred_sales
  JOIN sales ON sales.id = deferred_sales.sale_id
  LEFT JOIN fiscal_documents ON fiscal_documents.id = deferred_sales.satisfied_by_fiscal_document_id`;

export class SqliteDeferredSaleLookup implements DeferredSaleLookup {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  find(search: DeferredSaleSearch): DeferredSaleFacts | null {
    const row = this.rowOf(search);
    if (row === undefined) {
      return null;
    }
    const series = readRealTimeSeries(this.database);
    return {
      deferredSaleId: row.deferred_sale_id,
      saleId: row.sale_id,
      occurredAt: new Date(row.occurred_at),
      total: row.total,
      shortCode: row.short_code,
      cancelled: row.cancelled === 1,
      saleVoided: row.sale_voided === 1,
      invoice:
        row.point_of_sale === null || row.number === null
          ? { kind: "pending" }
          : { kind: "issued", pointOfSale: row.point_of_sale, number: row.number },
      originalPrintAttempted: row.original_print_attempted === 1,
      lastIssuedOn: latestIssuedOn(
        series.taxAuthorityLastIssuedOn,
        series.localLastAuthorizedIssuedOn,
      ),
    };
  }

  private rowOf(search: DeferredSaleSearch): DeferredSaleFactsRow | undefined {
    switch (search.kind) {
      case "short_code":
        return this.database
          .prepare<[string], DeferredSaleFactsRow>(
            `${FACTS_SELECT} WHERE deferred_sales.short_code = ?`,
          )
          .get(search.shortCode);
      case "reference":
        return this.database
          .prepare<[string, string], DeferredSaleFactsRow>(
            `${FACTS_SELECT} WHERE deferred_sales.id = ? AND deferred_sales.short_code = ?`,
          )
          .get(search.id, search.shortCode);
      case "sale":
        return this.database
          .prepare<[string], DeferredSaleFactsRow>(
            `${FACTS_SELECT} WHERE deferred_sales.sale_id = ?`,
          )
          .get(search.saleId);
    }
  }
}
