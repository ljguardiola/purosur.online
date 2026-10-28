import type { ReturnedFromLine, SaleForReturn } from "@purosur/domain";
import { DEFAULT_GOOD_CONDITION_RETURN_DAYS } from "@purosur/domain";
import type { ReturnSaleReader, SaleReturnSearch } from "@purosur/domain/returns/use-cases";
import { readRecordedPayments } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { readSale } from "../sales/sqlite-open-sale";

interface SaleDateRow {
  occurred_at: string | null;
}

interface InvoiceRow {
  point_of_sale: number;
  number: number;
}

interface RefundedRow {
  payment_id: string;
  refunded: number;
}

interface ReturnedRow {
  sale_line_id: string;
  quantity: number;
  refunded_amount: number;
}

export function readGoodConditionReturnDays(database: LocalDatabase): number {
  const row = database
    .prepare<[], { good_condition_return_days: number }>(
      "SELECT good_condition_return_days FROM branch_settings",
    )
    .get();
  return row?.good_condition_return_days ?? DEFAULT_GOOD_CONDITION_RETURN_DAYS;
}

function saleIdOf(database: LocalDatabase, search: SaleReturnSearch): string | undefined {
  switch (search.kind) {
    case "sale":
      return search.saleId;
    case "invoice":
      return database
        .prepare<[number, number, number, number], { sale_id: string }>(
          `SELECT sale_id FROM fiscal_documents
               WHERE point_of_sale = ? AND number = ? AND state = 'AUTHORIZED'
             UNION ALL
             SELECT sale_id FROM offline_fiscal_documents
               WHERE point_of_sale = ? AND number = ? AND document_type = 'factura_c'`,
        )
        .get(search.pointOfSale, search.number, search.pointOfSale, search.number)?.sale_id;
    case "deferred":
      return database
        .prepare<[string, string], { sale_id: string }>(
          "SELECT sale_id FROM deferred_sales WHERE id = ? AND short_code = ?",
        )
        .get(search.id, search.shortCode)?.sale_id;
  }
}

function invoiceOf(database: LocalDatabase, saleId: string): SaleForReturn["invoice"] {
  const row = database
    .prepare<[string, string], InvoiceRow>(
      `SELECT point_of_sale, number FROM fiscal_documents WHERE sale_id = ? AND state = 'AUTHORIZED'
       UNION ALL
       SELECT point_of_sale, number FROM offline_fiscal_documents
         WHERE sale_id = ? AND document_type = 'factura_c'`,
    )
    .get(saleId, saleId);
  return row === undefined ? null : { pointOfSale: row.point_of_sale, number: row.number };
}

function refundedByPayment(database: LocalDatabase, saleId: string): Map<string, number> {
  const rows = database
    .prepare<[string], RefundedRow>(
      `SELECT payment_refunds.payment_id AS payment_id, SUM(payment_refunds.amount) AS refunded
       FROM payment_refunds
       JOIN payment_transactions ON payment_transactions.id = payment_refunds.payment_id
       WHERE payment_transactions.sale_id = ?
       GROUP BY payment_refunds.payment_id`,
    )
    .all(saleId);
  return new Map(rows.map((row) => [row.payment_id, row.refunded]));
}

function returnedFromLines(database: LocalDatabase, saleId: string): ReturnedFromLine[] {
  return database
    .prepare<[string], ReturnedRow>(
      `SELECT return_lines.sale_line_id AS sale_line_id,
              SUM(return_lines.quantity) AS quantity,
              SUM(return_lines.refunded_amount) AS refunded_amount
       FROM return_lines
       JOIN returns ON returns.id = return_lines.return_id
       JOIN sale_lines ON sale_lines.id = return_lines.sale_line_id
       WHERE returns.sale_id = ?
       GROUP BY return_lines.sale_line_id
       ORDER BY sale_lines.position`,
    )
    .all(saleId)
    .map((row) => ({
      saleLineId: row.sale_line_id,
      quantity: row.quantity,
      refundedAmount: row.refunded_amount,
    }));
}

export function readSaleForReturn(
  database: LocalDatabase,
  search: SaleReturnSearch,
): SaleForReturn | undefined {
  const saleId = saleIdOf(database, search);
  const sale = saleId === undefined ? undefined : readSale(database, saleId);
  if (saleId === undefined || sale === undefined) {
    return undefined;
  }
  const occurredAt = database
    .prepare<[string], SaleDateRow>("SELECT occurred_at FROM sales WHERE id = ?")
    .get(saleId)?.occurred_at;
  if (occurredAt === null || occurredAt === undefined) {
    return undefined;
  }
  const refunded = refundedByPayment(database, saleId);
  return {
    sale,
    occurredAt: new Date(occurredAt),
    invoice: invoiceOf(database, saleId),
    payments: readRecordedPayments(database, saleId).map((payment) => ({
      id: payment.id,
      method: payment.method,
      provider: payment.provider,
      amount: payment.amount,
      state: payment.state,
      refundedAmount: refunded.get(payment.id) ?? 0,
      cardType: payment.method === "POINT" ? payment.cardType : null,
    })),
    returned: returnedFromLines(database, saleId),
  };
}

export class SqliteReturnSaleReader implements ReturnSaleReader {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  saleForReturn(search: SaleReturnSearch): SaleForReturn | undefined {
    return readSaleForReturn(this.database, search);
  }

  goodConditionReturnDays(): number {
    return readGoodConditionReturnDays(this.database);
  }
}
