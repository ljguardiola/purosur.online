import {
  type PointCardType,
  paidOrderWithoutSaleIsResolved,
  type RebuildablePaidOrder,
  type RebuiltSaleState,
  type SaleState,
} from "@purosur/domain";
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
  card_type: PointCardType | null;
  amount: number;
  created_at: string;
  recorded_at: string;
  resolved_at: string | null;
}

const PAID_ORDER_COLUMNS = `payment_transaction_id, sale_id, method, provider, card_type, amount,
  created_at, recorded_at, resolved_at`;

interface RebuiltSaleRow {
  sale_id: string;
  state: SaleState;
  payment_applied: number;
}

const REBUILT_SALES_OF_ORDER = `
  SELECT sales.id AS sale_id, sales.state AS state,
         EXISTS (
           SELECT 1 FROM payment_transactions
           WHERE payment_transactions.id = link.payment_transaction_id
             AND payment_transactions.sale_id = sales.id
             AND payment_transactions.state = 'APPROVED'
         ) AS payment_applied
  FROM sales_rebuilt_against_paid_orders AS link
  JOIN sales ON sales.id = link.sale_id`;

function rebuiltSaleStateOf(state: SaleState): RebuiltSaleState {
  return state === "OPEN" || state === "CANCELLED" ? state : "COMPLETED";
}

function paidOrderOf(
  row: PaidOrderRow,
  rebuiltSales: readonly RebuiltSaleRow[],
): PaidOrderWithoutSale {
  const rebuiltSaleId = rebuiltSales.find(({ state }) => state === "OPEN")?.sale_id;
  return {
    paymentTransactionId: row.payment_transaction_id,
    saleId: row.sale_id,
    method: row.method,
    provider: row.provider,
    amount: row.amount,
    createdAt: new Date(row.created_at),
    recordedAt: new Date(row.recorded_at),
    resolved: resolutionOf(row, rebuiltSales),
    ...(row.resolved_at === null ? {} : { resolvedAt: new Date(row.resolved_at) }),
    ...(rebuiltSaleId === undefined ? {} : { rebuiltSaleId }),
  };
}

function resolutionOf(row: PaidOrderRow, rebuiltSales: readonly RebuiltSaleRow[]): boolean {
  return paidOrderWithoutSaleIsResolved({
    convertedIntoRefund: row.resolved_at !== null,
    rebuiltSales: rebuiltSales.map(({ state, payment_applied }) => ({
      state: rebuiltSaleStateOf(state),
      paymentApplied: payment_applied === 1,
    })),
  });
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
      .prepare<[string], { state: SaleState }>("SELECT state FROM sales WHERE id = ?")
      .get(order.saleId);
    return {
      payment: payment?.state,
      sale: sale === undefined ? undefined : sale.state === "OPEN" ? "open" : "closed",
    };
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
    const row = this.paidOrderRow(paymentTransactionId);
    return row === undefined
      ? undefined
      : paidOrderOf(row, this.rebuiltSalesOf(row.payment_transaction_id));
  }

  rebuildablePaidOrder(paymentTransactionId: string): RebuildablePaidOrder | undefined {
    const row = this.paidOrderRow(paymentTransactionId);
    return row === undefined ? undefined : this.rebuildableOf(row);
  }

  paidOrderOfSale(saleId: string): RebuildablePaidOrder | undefined {
    const link = this.deps.database
      .prepare<[string], { payment_transaction_id: string }>(
        "SELECT payment_transaction_id FROM sales_rebuilt_against_paid_orders WHERE sale_id = ?",
      )
      .get(saleId);
    return link === undefined ? undefined : this.rebuildablePaidOrder(link.payment_transaction_id);
  }

  recordSaleRebuiltAgainstPaidOrder(saleId: string, paymentTransactionId: string): void {
    this.deps.database
      .prepare(
        "INSERT INTO sales_rebuilt_against_paid_orders (sale_id, payment_transaction_id) VALUES (?, ?)",
      )
      .run(saleId, paymentTransactionId);
  }

  private paidOrderRow(paymentTransactionId: string): PaidOrderRow | undefined {
    return this.deps.database
      .prepare<[string], PaidOrderRow>(
        `SELECT ${PAID_ORDER_COLUMNS} FROM paid_orders_without_sale WHERE payment_transaction_id = ?`,
      )
      .get(paymentTransactionId);
  }

  private rebuiltSalesOf(paymentTransactionId: string): RebuiltSaleRow[] {
    return this.deps.database
      .prepare<[string], RebuiltSaleRow>(
        `${REBUILT_SALES_OF_ORDER} WHERE link.payment_transaction_id = ?`,
      )
      .all(paymentTransactionId);
  }

  private rebuildableOf(row: PaidOrderRow): RebuildablePaidOrder {
    const common = {
      paymentTransactionId: row.payment_transaction_id,
      amount: row.amount,
      resolved: resolutionOf(row, this.rebuiltSalesOf(row.payment_transaction_id)),
    };
    return row.method === "POINT"
      ? { ...common, method: "POINT", provider: "MERCADOPAGO_POINT", cardType: row.card_type }
      : { ...common, method: "QR", provider: "MERCADOPAGO_QR" };
  }

  recordPaidOrderWithoutSale(order: ApprovedOrderOfRegister, recordedAt: Date): void {
    this.deps.database
      .prepare(
        `INSERT OR IGNORE INTO paid_orders_without_sale (${PAID_ORDER_COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        order.paymentTransactionId,
        order.saleId,
        order.method,
        order.provider,
        order.method === "POINT" ? order.cardType : null,
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
      .map((row) => paidOrderOf(row, this.rebuiltSalesOf(row.payment_transaction_id)));
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
          ? ({ method: "POINT", provider: "MERCADOPAGO_POINT", cardType: order.cardType } as const)
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
