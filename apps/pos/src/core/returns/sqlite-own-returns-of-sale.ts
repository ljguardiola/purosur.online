import type { OwnReturnsOfSale } from "@purosur/domain/returns/use-cases";
import type { LocalDatabase } from "../platform/local-database";

type LocalReturnOfSale = ReturnType<OwnReturnsOfSale["returnsOfSale"]>[number];

interface ReturnRow {
  id: string;
}

interface LineRow {
  return_id: string;
  sale_line_id: string;
  quantity: number;
  refunded_amount: number;
}

interface RefundRow {
  return_id: string;
  payment_id: string;
  amount: number;
}

export class SqliteOwnReturnsOfSale implements OwnReturnsOfSale {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  returnsOfSale(saleId: string): LocalReturnOfSale[] {
    const returns = this.database
      .prepare<[string], ReturnRow>(
        "SELECT id FROM returns WHERE sale_id = ? ORDER BY occurred_at, rowid",
      )
      .all(saleId);
    const lines = this.database
      .prepare<[string], LineRow>(
        `SELECT return_lines.return_id, return_lines.sale_line_id, return_lines.quantity,
                return_lines.refunded_amount
         FROM return_lines JOIN returns ON returns.id = return_lines.return_id
         WHERE returns.sale_id = ?
         ORDER BY return_lines.rowid`,
      )
      .all(saleId);
    const refunds = this.database
      .prepare<[string], RefundRow>(
        `SELECT payment_refunds.return_id, payment_refunds.payment_id, payment_refunds.amount
         FROM payment_refunds JOIN returns ON returns.id = payment_refunds.return_id
         WHERE returns.sale_id = ?
         ORDER BY payment_refunds.rowid`,
      )
      .all(saleId);
    return returns.map(({ id }) => ({
      id,
      lines: lines
        .filter(({ return_id: returnId }) => returnId === id)
        .map((line) => ({
          saleLineId: line.sale_line_id,
          quantity: line.quantity,
          refundedAmount: line.refunded_amount,
        })),
      refunds: refunds
        .filter(({ return_id: returnId }) => returnId === id)
        .map((refund) => ({ paymentId: refund.payment_id, amount: refund.amount })),
    }));
  }
}
