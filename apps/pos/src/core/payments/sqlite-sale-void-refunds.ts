import type { PointCardType } from "@purosur/domain";
import type { SaleVoidRefund, SaleVoidRefunds } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";

interface VoidRefundRow {
  method: SaleVoidRefund["method"];
  card_type: PointCardType | null;
  amount: number;
  state: SaleVoidRefund["state"];
}

export class SqliteSaleVoidRefunds implements SaleVoidRefunds {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  refundsOfVoid(saleId: string): SaleVoidRefund[] {
    return this.database
      .prepare<[string], VoidRefundRow>(
        `SELECT refund.method, payment.card_type, refund.amount, refund.state
         FROM payment_refunds refund
         JOIN payment_transactions payment ON payment.id = refund.payment_id
         WHERE payment.sale_id = ? AND refund.return_id IS NULL
         ORDER BY payment.approval_order, payment.rowid`,
      )
      .all(saleId)
      .map(({ card_type, ...refund }) => ({ ...refund, cardType: card_type }));
  }
}
