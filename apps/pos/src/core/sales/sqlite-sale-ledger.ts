import {
  type BuyerIdentificationThreshold,
  type DiscountBenefit,
  type DiscountTargetKind,
  discountsTargeting,
  newestPrice,
  nextOperationNumber,
  type OutboxEventDraft,
  type Sale,
  type SaleDiscount,
  type SaleLine,
  type SalePayment,
} from "@purosur/domain";
import type {
  CandidatePromotion,
  RegisterIdentity,
  SaleLedger,
  SaleLedgerTransaction,
  SaleRefund,
  SellingSession,
} from "@purosur/domain/sales/use-cases";
import {
  insertPreEmissionGateOutcome,
  readBuyerTaxStatusSetInEffect,
  readIssuerIdentificationInEffect,
} from "../fiscal/sqlite-pre-emission-gate";
import { decideSaleAuthorizationIn } from "../fiscal/sqlite-sale-authorization";
import {
  approvePendingMercadoPagoPayment,
  insertPendingMercadoPagoPayment,
  markQrPaymentReplaced,
  readPendingMercadoPagoPayment,
  readPendingMercadoPagoPaymentsOf,
  readSalePayments,
} from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { insertCashMovement, readMovementsOf } from "../register/sqlite-cash-ledger";
import type { SignInStore } from "../sessions/sqlite-sign-in-store";
import { addToStockBalance, insertSaleStockMovement } from "../stock/sqlite-stock-ledger";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { manualAdjustmentColumns } from "./sqlite-manual-adjustment";
import { type BenefitColumns, readOpenSale, toBenefit } from "./sqlite-open-sale";
import { saleDiscountColumns } from "./sqlite-sale-discount";
import {
  readActiveProductByBarcode,
  readActiveProductById,
  readSearchableProducts,
} from "./sqlite-sellable-products";

interface PriceRow {
  id: string;
  price_list_id: string;
  unit_price: number;
  valid_from: string;
}

interface CandidatePromotionRow extends BenefitColumns {
  id: string;
  name: string;
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
      activeProductByBarcode: (code) => readActiveProductByBarcode(this.database, code),
      activeProductById: (productId) => readActiveProductById(this.database, productId),
      searchableProducts: () => readSearchableProducts(this.database),
      buyerIdentificationThresholds: () => this.buyerIdentificationThresholds(),
      currentPrice: (productId) => this.currentPrice(productId),
      promotionsTargeting: (productId) => this.promotionsTargeting(productId),
      recordOpenedSale: (sale) => this.recordOpenedSale(sale),
      recordSaleLine: (saleId, line) => this.recordSaleLine(saleId, line),
      recordChangedLine: (line) => this.recordChangedLine(line),
      recordSaleDiscount: (saleId, discount) => this.recordSaleDiscount(saleId, discount),
      deleteSaleLine: (lineId) => this.deleteSaleLine(lineId),
      salePayments: (saleId) => readSalePayments(this.database, saleId),
      discardOpenSale: (saleId) => this.discardOpenSale(saleId),
      recordPayment: (payment) => this.recordPayment(payment),
      recordPendingMercadoPagoPayment: (payment) =>
        insertPendingMercadoPagoPayment(this.database, payment),
      pendingMercadoPagoPayment: (paymentTransactionId) =>
        readPendingMercadoPagoPayment(this.database, paymentTransactionId),
      pendingMercadoPagoPaymentsOf: (saleId) =>
        readPendingMercadoPagoPaymentsOf(this.database, saleId),
      approvePendingMercadoPagoPayment: (paymentTransactionId) =>
        approvePendingMercadoPagoPayment(this.database, paymentTransactionId),
      markQrPaymentReplaced: (paymentTransactionId, waitEndsAt) =>
        markQrPaymentReplaced(this.database, paymentTransactionId, waitEndsAt),
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

  private currentPrice(productId: string): { priceListId: string; unitPrice: number } | undefined {
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
    const price = newestPrice(candidates);
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
        `SELECT id, name, kind, percent, buy_qty, pay_qty, active, valid_from, valid_to, weekdays,
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
          name: row.name,
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
           id, sale_id, position, product_id, product_name, sale_unit, weight_source, quantity,
           list_unit_price, price_list_id, promotion_id, discount_amount, line_total,
           manual_adjustment_kind, manual_adjustment_value, manual_adjustment_reason,
           manual_adjustment_authorized_by
         ) VALUES (
           @id, @sale_id,
           (SELECT coalesce(max(position), 0) + 1 FROM sale_lines WHERE sale_id = @sale_id),
           @product_id, @product_name, @sale_unit, @weight_source,
           @quantity, @list_unit_price, @price_list_id,
           @promotion_id, @discount_amount, @line_total,
           @manual_adjustment_kind, @manual_adjustment_value, @manual_adjustment_reason,
           @manual_adjustment_authorized_by
         )`,
      )
      .run({
        id: line.id,
        sale_id: saleId,
        product_id: line.productId,
        product_name: line.productName,
        sale_unit: line.saleUnit,
        weight_source: line.weightSource,
        quantity: line.quantity,
        list_unit_price: line.listUnitPrice,
        price_list_id: line.priceListId,
        promotion_id: line.promotionId,
        discount_amount: line.discountAmount,
        line_total: line.lineTotal,
        ...manualAdjustmentColumns(line.manualAdjustment),
      });
    const freeze = this.database.prepare(
      `INSERT INTO sale_line_promotions (line_id, discount_id, name, kind, percent, buy_qty, pay_qty)
       VALUES (@line_id, @discount_id, @name, @kind, @percent, @buy_qty, @pay_qty)`,
    );
    for (const promotion of line.promotions) {
      freeze.run({
        line_id: line.id,
        discount_id: promotion.id,
        name: promotion.name,
        ...benefitColumns(promotion.benefit),
      });
    }
  }

  private recordChangedLine(line: SaleLine): void {
    this.database
      .prepare(
        `UPDATE sale_lines
         SET quantity = @quantity, weight_source = @weight_source, promotion_id = @promotion_id,
             discount_amount = @discount_amount, line_total = @line_total,
             manual_adjustment_kind = @manual_adjustment_kind,
             manual_adjustment_value = @manual_adjustment_value,
             manual_adjustment_reason = @manual_adjustment_reason,
             manual_adjustment_authorized_by = @manual_adjustment_authorized_by
         WHERE id = @id`,
      )
      .run({
        id: line.id,
        quantity: line.quantity,
        weight_source: line.weightSource,
        promotion_id: line.promotionId,
        discount_amount: line.discountAmount,
        line_total: line.lineTotal,
        ...manualAdjustmentColumns(line.manualAdjustment),
      });
  }

  private recordSaleDiscount(saleId: string, discount: SaleDiscount | null): void {
    this.database
      .prepare(
        `UPDATE sales
         SET sale_discount_kind = @sale_discount_kind, sale_discount_value = @sale_discount_value,
             sale_discount_reason = @sale_discount_reason,
             sale_discount_authorized_by = @sale_discount_authorized_by
         WHERE id = @id`,
      )
      .run({ id: saleId, ...saleDiscountColumns(discount) });
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

  private recordPayment(payment: SalePayment): void {
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
