import type {
  OutboxEventDraft,
  PaymentTransaction,
  Sale,
  SaleLine,
  SaleUnit,
  SaleWithLines,
} from "@purosur/domain";
import type {
  RegisterIdentity,
  SaleLedger,
  SaleLedgerTransaction,
  ScannedProduct,
  SellingSession,
} from "@purosur/domain/sales/use-cases";
import type { SignInStore } from "../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../platform/local-database";
import { insertCashMovement } from "../register/sqlite-cash-ledger";
import { appendOutboxEvent } from "../sync/sqlite-outbox";

interface SaleRow {
  id: string;
  register_id: string;
  device_id: string;
  session_id: string;
  actor_id: string;
  occurred_at: string;
}

interface LineRow {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  list_unit_price: number;
  price_list_id: string;
  line_total: number;
}

export class SqliteSaleLedger implements SaleLedger {
  private readonly database: LocalDatabase;
  private readonly people: Pick<SignInStore, "activePerson">;
  private readonly outboxChainKey: string | undefined;

  constructor(
    database: LocalDatabase,
    people: Pick<SignInStore, "activePerson">,
    outboxChainKey?: string,
  ) {
    this.database = database;
    this.people = people;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: SaleLedgerTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): SaleLedgerTransaction {
    return {
      sellerAccess: (userId) => this.people.activePerson(userId)?.access,
      openSession: () => this.openSession(),
      openSale: (sessionId) => this.openSale(sessionId),
      installationRevoked: () => this.installationRevoked(),
      registerIdentity: () => this.registerIdentity(),
      activeProductByBarcode: (code) => this.activeProductByBarcode(code),
      priceAt: (productId, moment) => this.priceAt(productId, moment),
      recordOpenedSale: (sale) => this.recordOpenedSale(sale),
      recordSaleLine: (saleId, line) => this.recordSaleLine(saleId, line),
      recordLineQuantity: (line) => this.recordLineQuantity(line),
      recordPayment: (payment) => this.recordPayment(payment),
      recordCashMovement: (movement) => insertCashMovement(this.database, movement),
      recordCompletedSale: (saleId) => this.recordCompletedSale(saleId),
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
    };
  }

  private openSession(): SellingSession | undefined {
    const row = this.database
      .prepare<[], { id: string; opened_by: string }>(
        "SELECT id, opened_by FROM cash_sessions WHERE state = 'OPEN'",
      )
      .get();
    return row === undefined ? undefined : { id: row.id, openedBy: row.opened_by };
  }

  private openSale(sessionId: string): SaleWithLines | undefined {
    const sale = this.database
      .prepare<[string], SaleRow>(
        `SELECT id, register_id, device_id, session_id, actor_id, occurred_at
         FROM sales WHERE session_id = ? AND state = 'OPEN'`,
      )
      .get(sessionId);
    if (sale === undefined) {
      return undefined;
    }
    const lines = this.database
      .prepare<[string], LineRow>(
        `SELECT id, product_id, product_name, quantity, list_unit_price, price_list_id, line_total
         FROM sale_lines WHERE sale_id = ? ORDER BY position`,
      )
      .all(sale.id);
    return {
      id: sale.id,
      registerId: sale.register_id,
      deviceId: sale.device_id,
      sessionId: sale.session_id,
      actorId: sale.actor_id,
      state: "OPEN",
      occurredAt: new Date(sale.occurred_at),
      lines: lines.map(toSaleLine),
    };
  }

  private installationRevoked(): boolean {
    const row = this.database
      .prepare<[], { installation_revoked_at: string | null }>(
        "SELECT installation_revoked_at FROM sync_state",
      )
      .get();
    return row?.installation_revoked_at != null;
  }

  private registerIdentity(): RegisterIdentity | undefined {
    const row = this.database
      .prepare<[], { register_id: string; device_id: string }>(
        `SELECT own_register.id AS register_id, sync_state.device_id AS device_id
         FROM own_register, sync_state
         WHERE own_register.removed = 0 AND sync_state.device_id IS NOT NULL`,
      )
      .get();
    return row === undefined ? undefined : { registerId: row.register_id, deviceId: row.device_id };
  }

  private activeProductByBarcode(code: string): ScannedProduct | undefined {
    const row = this.database
      .prepare<[string], { id: string; name: string; sale_unit: string }>(
        `SELECT products.id AS id, products.name AS name, products.sale_unit AS sale_unit
         FROM products
         JOIN product_barcodes ON product_barcodes.product_id = products.id
         WHERE product_barcodes.code = ? AND product_barcodes.active = 1
           AND products.active = 1 AND products.removed = 0
         ORDER BY products.id
         LIMIT 1`,
      )
      .get(code);
    return row === undefined
      ? undefined
      : { id: row.id, name: row.name, saleUnit: row.sale_unit as SaleUnit };
  }

  private priceAt(
    productId: string,
    moment: Date,
  ): { priceListId: string; unitPrice: number } | undefined {
    const row = this.database
      .prepare<[string, string], { price_list_id: string; unit_price: number }>(
        `SELECT price_list_id, unit_price FROM prices
         WHERE product_id = ? AND removed = 0 AND valid_from <= ?
         ORDER BY valid_from DESC, version DESC, id DESC
         LIMIT 1`,
      )
      .get(productId, moment.toISOString());
    return row === undefined
      ? undefined
      : { priceListId: row.price_list_id, unitPrice: row.unit_price };
  }

  private recordOpenedSale(sale: Sale): void {
    this.database
      .prepare(
        `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES (@id, @register_id, @device_id, @session_id, @actor_id, @state, @occurred_at)`,
      )
      .run({
        id: sale.id,
        register_id: sale.registerId,
        device_id: sale.deviceId,
        session_id: sale.sessionId,
        actor_id: sale.actorId,
        state: sale.state,
        occurred_at: sale.occurredAt.toISOString(),
      });
  }

  private recordSaleLine(saleId: string, line: SaleLine): void {
    this.database
      .prepare(
        `INSERT INTO sale_lines (
           id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id, line_total
         ) VALUES (
           @id, @sale_id,
           (SELECT coalesce(max(position), 0) + 1 FROM sale_lines WHERE sale_id = @sale_id),
           @product_id, @product_name, @quantity, @list_unit_price, @price_list_id, @line_total
         )`,
      )
      .run({
        id: line.id,
        sale_id: saleId,
        product_id: line.productId,
        product_name: line.productName,
        quantity: line.quantity,
        list_unit_price: line.listUnitPrice,
        price_list_id: line.priceListId,
        line_total: line.lineTotal,
      });
  }

  private recordLineQuantity(line: SaleLine): void {
    this.database
      .prepare(
        "UPDATE sale_lines SET quantity = @quantity, line_total = @line_total WHERE id = @id",
      )
      .run({ id: line.id, quantity: line.quantity, line_total: line.lineTotal });
  }

  private recordPayment(payment: PaymentTransaction): void {
    this.database
      .prepare(
        `INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
         VALUES (@id, @sale_id, @kind, @method, @provider, @amount, @tendered, @state, @occurred_at)`,
      )
      .run({
        id: payment.id,
        sale_id: payment.saleId,
        kind: payment.kind,
        method: payment.method,
        provider: payment.provider,
        amount: payment.amount,
        tendered: payment.tendered ?? null,
        state: payment.state,
        occurred_at: payment.occurredAt.toISOString(),
      });
  }

  private recordCompletedSale(saleId: string): void {
    const { changes } = this.database
      .prepare("UPDATE sales SET state = 'COMPLETED' WHERE id = ? AND state = 'OPEN'")
      .run(saleId);
    if (changes !== 1) {
      throw new Error("the sale is not in progress");
    }
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the ledger has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}

function toSaleLine(row: LineRow): SaleLine {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    listUnitPrice: row.list_unit_price,
    priceListId: row.price_list_id,
    lineTotal: row.line_total,
  };
}
