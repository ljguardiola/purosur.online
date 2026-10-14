import type {
  ApprovedOrderOfRegister,
  LocalPaidOrders,
  PaidOrderWithoutSale,
} from "@purosur/domain/payments/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import {
  approvePendingMercadoPagoPayment,
  insertPendingMercadoPagoPayment,
} from "./sqlite-sale-payments";

type LocalStateOfPaidOrder = ReturnType<LocalPaidOrders["localStateOf"]>;

export interface SqliteLocalPaidOrdersDeps {
  database: LocalDatabase;
}

interface PaidOrderRow {
  payment_transaction_id: string;
  sale_id: string;
  method: ApprovedOrderOfRegister["method"];
  provider: ApprovedOrderOfRegister["provider"];
  amount: number;
  created_at: string;
  recorded_at: string;
  resolved_at: string | null;
}

const PAID_ORDER_COLUMNS = `payment_transaction_id, sale_id, method, provider, amount, created_at,
  recorded_at, resolved_at`;

function paidOrderOf(row: PaidOrderRow): PaidOrderWithoutSale {
  return {
    paymentTransactionId: row.payment_transaction_id,
    saleId: row.sale_id,
    method: row.method,
    provider: row.provider,
    amount: row.amount,
    createdAt: new Date(row.created_at),
    recordedAt: new Date(row.recorded_at),
    resolved: row.resolved_at !== null,
    ...(row.resolved_at === null ? {} : { resolvedAt: new Date(row.resolved_at) }),
  };
}

export class SqliteLocalPaidOrders implements LocalPaidOrders {
  private readonly deps: SqliteLocalPaidOrdersDeps;

  constructor(deps: SqliteLocalPaidOrdersDeps) {
    this.deps = deps;
  }

  localStateOf(order: ApprovedOrderOfRegister): LocalStateOfPaidOrder {
    const payment = this.deps.database
      .prepare<[string], { state: LocalStateOfPaidOrder["payment"] }>(
        "SELECT state FROM payment_transactions WHERE id = ?",
      )
      .get(order.paymentTransactionId);
    const sale = this.deps.database
      .prepare<[string], { state: LocalStateOfPaidOrder["sale"] }>(
        "SELECT state FROM sales WHERE id = ?",
      )
      .get(order.saleId);
    return { payment: payment?.state, sale: sale?.state };
  }

  actorOfSale(saleId: string): string | undefined {
    return this.deps.database
      .prepare<[string], { actor_id: string }>("SELECT actor_id FROM sales WHERE id = ?")
      .get(saleId)?.actor_id;
  }

  inOneTransaction<TOutcome>(work: () => TOutcome): TOutcome {
    return this.deps.database.transaction(work)();
  }

  approvePayment(paymentTransactionId: string): void {
    approvePendingMercadoPagoPayment(this.deps.database, paymentTransactionId);
  }

  paidOrderWithoutSale(paymentTransactionId: string): PaidOrderWithoutSale | undefined {
    const row = this.deps.database
      .prepare<[string], PaidOrderRow>(
        `SELECT ${PAID_ORDER_COLUMNS} FROM paid_orders_without_sale WHERE payment_transaction_id = ?`,
      )
      .get(paymentTransactionId);
    return row === undefined ? undefined : paidOrderOf(row);
  }

  recordPaidOrderWithoutSale(order: ApprovedOrderOfRegister, recordedAt: Date): void {
    this.deps.database
      .prepare(
        `INSERT OR IGNORE INTO paid_orders_without_sale (${PAID_ORDER_COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        order.paymentTransactionId,
        order.saleId,
        order.method,
        order.provider,
        order.amount,
        order.createdAt.toISOString(),
        recordedAt.toISOString(),
      );
  }

  resolvePaidOrderWithoutSale(paymentTransactionId: string, resolvedAt: Date): void {
    this.deps.database
      .prepare(
        "UPDATE paid_orders_without_sale SET resolved_at = ? WHERE payment_transaction_id = ? AND resolved_at IS NULL",
      )
      .run(resolvedAt.toISOString(), paymentTransactionId);
  }

  paidOrdersWithoutSale(): PaidOrderWithoutSale[] {
    return this.deps.database
      .prepare<[], PaidOrderRow>(
        `SELECT ${PAID_ORDER_COLUMNS} FROM paid_orders_without_sale ORDER BY recorded_at, rowid`,
      )
      .all()
      .map(paidOrderOf);
  }

  holdAsPendingPayment(order: ApprovedOrderOfRegister): void {
    const { database } = this.deps;
    const held = database
      .prepare<[string], { id: string }>("SELECT id FROM payment_transactions WHERE id = ?")
      .get(order.paymentTransactionId);
    if (held === undefined) {
      insertPendingMercadoPagoPayment(database, {
        id: order.paymentTransactionId,
        saleId: order.saleId,
        kind: "SALE",
        state: "PENDING",
        amount: order.amount,
        occurredAt: order.createdAt,
        waitEndsAt: order.createdAt,
        ...(order.method === "POINT"
          ? ({ method: "POINT", provider: "MERCADOPAGO_POINT" } as const)
          : ({ method: "QR", provider: "MERCADOPAGO_QR" } as const)),
      });
      return;
    }
    database
      .prepare(
        "UPDATE payment_transactions SET state = 'PENDING', replaced = 0 WHERE id = ? AND method IN ('QR', 'POINT')",
      )
      .run(order.paymentTransactionId);
  }
}
