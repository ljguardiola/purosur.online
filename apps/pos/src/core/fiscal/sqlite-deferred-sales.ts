import {
  type DeferredSale,
  type DeferredSaleFacts,
  type DeferredSaleRecord,
  latestIssuedOn,
} from "@purosur/domain";
import { ShortCodeTaken } from "@purosur/domain/fiscal/use-cases";
import type { DeferredSaleLookup, DeferredSaleSearch } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { readRealTimeSeries } from "./sqlite-fiscal-series";

const SHORT_CODE_UNIQUE_INDEX = "UNIQUE constraint failed: deferred_sales.short_code";

export function insertDeferredSale(database: LocalDatabase, sale: DeferredSale): void {
  try {
    database
      .prepare(
        `INSERT INTO deferred_sales (id, sale_id, occurred_at, total, reason, short_code, routed_at)
         VALUES (@id, @sale_id, @occurred_at, @total, @reason, @short_code, @routed_at)`,
      )
      .run({
        id: sale.id,
        sale_id: sale.saleId,
        occurred_at: sale.occurredAt.toISOString(),
        total: sale.total,
        reason: sale.reason,
        short_code: sale.shortCode,
        routed_at: sale.routedAt.toISOString(),
      });
  } catch (error) {
    if (error instanceof Error && error.message === SHORT_CODE_UNIQUE_INDEX) {
      throw new ShortCodeTaken();
    }
    throw error;
  }
}

export function readUncancelledDeferredSaleRecord(
  database: LocalDatabase,
  saleId: string,
): DeferredSaleRecord | null {
  const row = database
    .prepare<[string], { satisfied: 0 | 1 }>(
      `SELECT (satisfied_at IS NOT NULL) AS satisfied FROM deferred_sales
       WHERE sale_id = ? AND cancelled_at IS NULL`,
    )
    .get(saleId);
  return row === undefined ? null : { satisfied: row.satisfied === 1 };
}

export function cancelDeferredSale(
  database: LocalDatabase,
  saleId: string,
  cancelledAt: Date,
): void {
  const { changes } = database
    .prepare(
      `UPDATE deferred_sales SET cancelled_at = ?
       WHERE sale_id = ? AND satisfied_at IS NULL AND cancelled_at IS NULL`,
    )
    .run(cancelledAt.toISOString(), saleId);
  if (changes !== 1) {
    throw new Error("the sale has no pending deferred record");
  }
}

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
