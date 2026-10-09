import {
  type BuyerIdentificationThreshold,
  type DiscountBenefit,
  type DiscountTargetKind,
  discountsTargeting,
  nextOperationNumber,
  type OutboxEventDraft,
  type PaymentTransaction,
  priceInEffectAt,
  type Sale,
  type SaleLine,
  type SaleUnit,
  type SearchableProduct,
} from "@purosur/domain";
import type {
  CandidatePromotion,
  RegisterIdentity,
  SaleLedger,
  SaleLedgerTransaction,
  SaleRefund,
  SellableProduct,
  SellingSession,
} from "@purosur/domain/sales/use-cases";
import {
  insertPreEmissionGateOutcome,
  readBuyerTaxStatusSetInEffect,
  readIssuerIdentificationInEffect,
} from "../fiscal/sqlite-pre-emission-gate";
import { decideSaleAuthorizationIn } from "../fiscal/sqlite-sale-authorization";
import { readSalePayments } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { insertCashMovement, readMovementsOf } from "../register/sqlite-cash-ledger";
import type { SignInStore } from "../sessions/sqlite-sign-in-store";
import { addToStockBalance, insertSaleStockMovement } from "../stock/sqlite-stock-ledger";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { type BenefitColumns, readOpenSale, toBenefit } from "./sqlite-open-sale";

interface PriceRow {
  id: string;
  price_list_id: string;
  unit_price: number;
  valid_from: string;
}

interface CandidatePromotionRow extends BenefitColumns {
  id: string;
  target_kind: DiscountTargetKind;
  target_id: string;
  active: number;
  valid_from: string;
  valid_to: string;
  weekdays: string;
}

function benefitColumns(benefit: DiscountBenefit): BenefitColumns {
  return benefit.kind === "PERCENT_OFF"
    ? { kind: benefit.kind, percent: benefit.percent, buy_qty: null, pay_qty: null }
    : { kind: benefit.kind, percent: null, buy_qty: benefit.buyQty, pay_qty: benefit.payQty };
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
      openSale: (sessionId) => readOpenSale(this.database, sessionId),
      installationRevoked: () => this.installationRevoked(),
      registerIdentity: () => this.registerIdentity(),
      activeProductByBarcode: (code) => this.activeProductByBarcode(code),
      activeProductById: (productId) => this.activeProductById(productId),
      searchableProducts: () => this.searchableProducts(),
      buyerIdentificationThresholds: () => this.buyerIdentificationThresholds(),
      priceAt: (productId, moment) => this.priceAt(productId, moment),
      promotionsTargeting: (productId) => this.promotionsTargeting(productId),
      recordOpenedSale: (sale) => this.recordOpenedSale(sale),
      recordSaleLine: (saleId, line) => this.recordSaleLine(saleId, line),
      recordLineQuantity: (line) => this.recordLineQuantity(line),
      deleteSaleLine: (lineId) => this.deleteSaleLine(lineId),
      salePayments: (saleId) => readSalePayments(this.database, saleId),
      discardOpenSale: (saleId) => this.discardOpenSale(saleId),
      recordPayment: (payment) => this.recordPayment(payment),
      saleCashMovements: (saleId) => readMovementsOf(this.database, { type: "sale", id: saleId }),
      recordCashMovement: (movement) => insertCashMovement(this.database, movement),
      recordSaleStockMovement: (movement) => insertSaleStockMovement(this.database, movement),
      addToStockBalance: (productId, delta) => addToStockBalance(this.database, productId, delta),
      takeOperationNumber: () => this.takeOperationNumber(),
      recordCompletedSale: (saleId, occurredAt, operationNumber) =>
        this.recordCompletedSale(saleId, occurredAt, operationNumber),
      recordCancelledSale: (saleId, occurredAt, authorizedBy) =>
        this.recordCancelledSale(saleId, occurredAt, authorizedBy),
      recordRefund: (refund) => this.recordRefund(refund),
      outboxReady: () => this.outboxChainKey !== undefined,
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
      issuerIdentificationInEffect: () => readIssuerIdentificationInEffect(this.database),
      buyerTaxStatusSetInEffect: () => readBuyerTaxStatusSetInEffect(this.database),
      recordPreEmissionGate: (recorded) => insertPreEmissionGateOutcome(this.database, recorded),
      decideSaleAuthorization: (decision) => decideSaleAuthorizationIn(this.database, decision),
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

  private activeProductByBarcode(code: string): SellableProduct | undefined {
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

  private activeProductById(productId: string): SellableProduct | undefined {
    const row = this.database
      .prepare<[string], { id: string; name: string; sale_unit: string }>(
        `SELECT id, name, sale_unit FROM products
         WHERE id = ? AND active = 1 AND removed = 0`,
      )
      .get(productId);
    return row === undefined
      ? undefined
      : { id: row.id, name: row.name, saleUnit: row.sale_unit as SaleUnit };
  }

  private searchableProducts(): SearchableProduct[] {
    return this.database
      .prepare<[], { id: string; name: string; sale_unit: string; times_sold_here: number }>(
        `SELECT products.id AS id, products.name AS name, products.sale_unit AS sale_unit,
           (SELECT count(*) FROM sale_lines
            JOIN sales ON sales.id = sale_lines.sale_id
            WHERE sale_lines.product_id = products.id AND sales.state = 'COMPLETED'
              AND sales.register_id IN (SELECT id FROM own_register WHERE removed = 0)
           ) AS times_sold_here
         FROM products
         WHERE products.active = 1 AND products.removed = 0
         ORDER BY products.id`,
      )
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        saleUnit: row.sale_unit as SaleUnit,
        timesSoldHere: row.times_sold_here,
      }));
  }

  private buyerIdentificationThresholds(): BuyerIdentificationThreshold[] {
    return this.database
      .prepare<[], { id: string; amount: number; valid_from: string; revision: number }>(
        "SELECT id, amount, valid_from, revision FROM buyer_identification_thresholds ORDER BY valid_from, revision",
      )
      .all()
      .map((row) => ({
        id: row.id,
        amount: row.amount,
        validFrom: row.valid_from,
        revision: row.revision,
      }));
  }

  private priceAt(
    productId: string,
    moment: Date,
  ): { priceListId: string; unitPrice: number } | undefined {
    const candidates = this.database
      .prepare<[string], PriceRow>(
        "SELECT id, price_list_id, unit_price, valid_from FROM prices WHERE product_id = ? AND removed = 0",
      )
      .all(productId)
      .map((row) => ({
        id: row.id,
        priceListId: row.price_list_id,
        unitPrice: row.unit_price,
        validFrom: new Date(row.valid_from),
      }));
    const price = priceInEffectAt(candidates, moment);
    return price && { priceListId: price.priceListId, unitPrice: price.unitPrice };
  }

  private promotionsTargeting(productId: string): CandidatePromotion[] {
    const product = this.database
      .prepare<[string], { category_id: string }>("SELECT category_id FROM products WHERE id = ?")
      .get(productId);
    if (product === undefined) {
      return [];
    }
    const tags = this.database
      .prepare<[string], { tag_id: string; active: number }>(
        "SELECT tag_id, active FROM product_tags WHERE product_id = ?",
      )
      .all(productId)
      .map((row) => ({ tagId: row.tag_id, active: row.active === 1 }));
    const categories = this.database
      .prepare<[], { id: string; parent_id: string | null }>("SELECT id, parent_id FROM categories")
      .all()
      .map((row) => ({ id: row.id, parentId: row.parent_id }));
    const candidates = this.database
      .prepare<[], CandidatePromotionRow>(
        `SELECT id, kind, percent, buy_qty, pay_qty, active, valid_from, valid_to, weekdays,
                target_kind, target_id
         FROM discounts
         WHERE removed = 0
         ORDER BY id`,
      )
      .all()
      .map((row) => ({
        target: { kind: row.target_kind, id: row.target_id },
        promotion: {
          id: row.id,
          benefit: toBenefit(row),
          active: row.active === 1,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          weekdays: JSON.parse(row.weekdays) as number[],
        },
      }));
    return discountsTargeting(
      candidates,
      { id: productId, categoryId: product.category_id, tags },
      categories,
    ).map(({ promotion }) => promotion);
  }

  private recordOpenedSale(sale: Sale): void {
    this.database
      .prepare(
        `INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state)
         VALUES (@id, @register_id, @device_id, @session_id, @actor_id, @state)`,
      )
      .run({
        id: sale.id,
        register_id: sale.registerId,
        device_id: sale.deviceId,
        session_id: sale.sessionId,
        actor_id: sale.actorId,
        state: sale.state,
      });
  }

  private recordSaleLine(saleId: string, line: SaleLine): void {
    this.database
      .prepare(
        `INSERT INTO sale_lines (
           id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id,
           promotion_id, discount_amount, line_total
         ) VALUES (
           @id, @sale_id,
           (SELECT coalesce(max(position), 0) + 1 FROM sale_lines WHERE sale_id = @sale_id),
           @product_id, @product_name, @quantity, @list_unit_price, @price_list_id,
           @promotion_id, @discount_amount, @line_total
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
        promotion_id: line.promotionId,
        discount_amount: line.discountAmount,
        line_total: line.lineTotal,
      });
    const freeze = this.database.prepare(
      `INSERT INTO sale_line_promotions (line_id, discount_id, kind, percent, buy_qty, pay_qty)
       VALUES (@line_id, @discount_id, @kind, @percent, @buy_qty, @pay_qty)`,
    );
    for (const promotion of line.promotions) {
      freeze.run({
        line_id: line.id,
        discount_id: promotion.id,
        ...benefitColumns(promotion.benefit),
      });
    }
  }

  private recordLineQuantity(line: SaleLine): void {
    this.database
      .prepare(
        `UPDATE sale_lines
         SET quantity = @quantity, promotion_id = @promotion_id,
             discount_amount = @discount_amount, line_total = @line_total
         WHERE id = @id`,
      )
      .run({
        id: line.id,
        quantity: line.quantity,
        promotion_id: line.promotionId,
        discount_amount: line.discountAmount,
        line_total: line.lineTotal,
      });
  }

  private deleteSaleLine(lineId: string): void {
    this.database.prepare("DELETE FROM sale_line_promotions WHERE line_id = ?").run(lineId);
    this.database.prepare("DELETE FROM sale_lines WHERE id = ?").run(lineId);
  }

  private discardOpenSale(saleId: string): void {
    this.database
      .prepare(
        "DELETE FROM sale_line_promotions WHERE line_id IN (SELECT id FROM sale_lines WHERE sale_id = ?)",
      )
      .run(saleId);
    this.database.prepare("DELETE FROM sale_lines WHERE sale_id = ?").run(saleId);
    this.database.prepare("DELETE FROM sales WHERE id = ?").run(saleId);
  }

  private recordPayment(payment: PaymentTransaction): void {
    this.database
      .prepare(
        `INSERT INTO payment_transactions (
           id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state,
           occurred_at
         ) VALUES (
           @id, @sale_id, @kind, @method, @provider, @amount, @tendered, @authorized_by,
           @confirmed_at, @state, @occurred_at
         )`,
      )
      .run({
        id: payment.id,
        sale_id: payment.saleId,
        kind: payment.kind,
        method: payment.method,
        provider: payment.provider,
        amount: payment.amount,
        tendered: payment.tendered ?? null,
        authorized_by: payment.method === "TRANSFER" ? payment.authorizedBy : null,
        confirmed_at: payment.method === "TRANSFER" ? payment.confirmedAt.toISOString() : null,
        state: payment.state,
        occurred_at: payment.occurredAt.toISOString(),
      });
  }

  private takeOperationNumber(): number {
    const { last_number: lastTaken } = this.database
      .prepare<[], { last_number: number }>("SELECT last_number FROM operation_counter")
      .get() ?? { last_number: 0 };
    const taken = nextOperationNumber(lastTaken);
    this.database.prepare("UPDATE operation_counter SET last_number = ?").run(taken);
    return taken;
  }

  private recordCompletedSale(saleId: string, occurredAt: Date, operationNumber: number): void {
    const { changes } = this.database
      .prepare(
        `UPDATE sales SET state = 'COMPLETED', occurred_at = ?, operation_number = ?
         WHERE id = ? AND state = 'OPEN'`,
      )
      .run(occurredAt.toISOString(), operationNumber, saleId);
    if (changes !== 1) {
      throw new Error("the sale is not in progress");
    }
  }

  private recordCancelledSale(
    saleId: string,
    occurredAt: Date,
    authorizedBy: string | undefined,
  ): void {
    const { changes } = this.database
      .prepare(
        `UPDATE sales
         SET state = 'CANCELLED', occurred_at = ?, cancellation_authorized_by = ?
         WHERE id = ? AND state = 'OPEN'`,
      )
      .run(occurredAt.toISOString(), authorizedBy ?? null, saleId);
    if (changes !== 1) {
      throw new Error("the sale is not in progress");
    }
  }

  private recordRefund(refund: SaleRefund): void {
    this.database
      .prepare(
        `INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
         VALUES (@id, @payment_id, @method, @provider, @amount, @state, @occurred_at)`,
      )
      .run({
        id: refund.id,
        payment_id: refund.paymentId,
        method: refund.method,
        provider: refund.provider,
        amount: refund.amount,
        state: refund.state,
        occurred_at: refund.occurredAt.toISOString(),
      });
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the ledger has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}
