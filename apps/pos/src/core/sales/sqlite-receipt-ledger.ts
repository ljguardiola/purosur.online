import {
  amountToCharge,
  type LinePromotion,
  type ManualAdjustment,
  type ManualAdjustmentValue,
  type OutboxEventDraft,
  type ReceiptDelivery,
  type ReceiptSource,
  type SaleDiscount,
  type SaleDiscountValue,
  type SaleUnit,
} from "@purosur/domain";
import type {
  ReceiptLedger,
  ReceiptLedgerTransaction,
  ReceiptReprint,
  StoredReceipt,
} from "@purosur/domain/sales/use-cases";
import { readSaleFiscalDocument } from "../fiscal/sqlite-sale-fiscal-document";
import { readSalePayments } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { type ManualAdjustmentColumns, toManualAdjustment } from "./sqlite-manual-adjustment";
import { type BenefitColumns, toBenefit } from "./sqlite-open-sale";
import { type SaleDiscountColumns, toSaleDiscount } from "./sqlite-sale-discount";

function receiptSaleDiscount(discount: SaleDiscount | null): SaleDiscountValue | null {
  if (discount === null) {
    return null;
  }
  return discount.kind === "PERCENT"
    ? { kind: "PERCENT", percent: discount.percent }
    : { kind: "AMOUNT", amount: discount.amount };
}

interface DeliveryRow {
  print_attempted_at: string | null;
  printed_at: string | null;
  reprint_count: number;
}

interface SaleRow extends SaleDiscountColumns {
  occurred_at: string;
  first_name: string;
  operation_number: number | null;
}

interface BranchRow {
  address: string;
  whatsapp_number: string;
  instagram_handle: string;
}

interface LineRow extends ManualAdjustmentColumns {
  id: string;
  product_name: string;
  sale_unit: string;
  quantity: number;
  list_unit_price: number;
  promotion_id: string | null;
  discount_amount: number;
  line_total: number;
}

interface FrozenPromotionRow extends BenefitColumns {
  line_id: string;
  discount_id: string;
  name: string;
}

interface StoredReceiptRow {
  template_version: string;
  head: Buffer;
  body: Buffer;
}

function adjustmentValue(adjustment: ManualAdjustment | null): ManualAdjustmentValue | null {
  if (adjustment === null) {
    return null;
  }
  switch (adjustment.kind) {
    case "PRICE":
      return { kind: "PRICE", unitPrice: adjustment.unitPrice };
    case "PERCENT":
      return { kind: "PERCENT", percent: adjustment.percent };
    case "AMOUNT":
      return { kind: "AMOUNT", amount: adjustment.amount };
  }
}

export class SqliteReceiptLedger implements ReceiptLedger {
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, outboxChainKey?: string) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: ReceiptLedgerTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): ReceiptLedgerTransaction {
    return {
      receiptDelivery: (saleId) => this.receiptDelivery(saleId),
      receiptSource: (saleId) => this.receiptSource(saleId),
      storedReceipt: (saleId) => this.storedReceipt(saleId),
      recordStoredReceipt: (saleId, receipt) => this.recordStoredReceipt(saleId, receipt),
      recordPrintAttempt: (saleId, at) => this.recordPrintAttempt(saleId, at),
      recordPrinted: (saleId, at) => this.recordPrinted(saleId, at),
      recordReprint: (reprint) => this.recordReprint(reprint),
      outboxReady: () => this.outboxChainKey !== undefined,
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
    };
  }

  private receiptDelivery(saleId: string): ReceiptDelivery | undefined {
    const row = this.database
      .prepare<[string], DeliveryRow>(
        `SELECT print_attempted_at, printed_at,
                (SELECT count(*) FROM sale_reprints WHERE sale_reprints.sale_id = sales.id) AS reprint_count
         FROM sales WHERE id = ? AND state = 'COMPLETED'`,
      )
      .get(saleId);
    return row === undefined
      ? undefined
      : {
          printAttemptedAt:
            row.print_attempted_at === null ? null : new Date(row.print_attempted_at),
          printedAt: row.printed_at === null ? null : new Date(row.printed_at),
          reprintCount: row.reprint_count,
        };
  }

  private receiptSource(saleId: string): ReceiptSource {
    const sale = this.database
      .prepare<[string], SaleRow>(
        `SELECT sales.occurred_at AS occurred_at, users.first_name AS first_name,
                sales.operation_number AS operation_number,
                sales.sale_discount_kind AS sale_discount_kind,
                sales.sale_discount_value AS sale_discount_value,
                sales.sale_discount_reason AS sale_discount_reason,
                sales.sale_discount_authorized_by AS sale_discount_authorized_by
         FROM sales JOIN users ON users.id = sales.actor_id
         WHERE sales.id = ? AND sales.state = 'COMPLETED'`,
      )
      .get(saleId);
    const branch = this.database
      .prepare<[], BranchRow>(
        "SELECT address, whatsapp_number, instagram_handle FROM branch_settings ORDER BY location_id LIMIT 1",
      )
      .get();
    if (sale === undefined || sale.operation_number === null || branch === undefined) {
      throw new Error("the sale's receipt cannot be sourced");
    }
    const lines = this.receiptLines(saleId);
    const saleDiscount = toSaleDiscount(sale);
    return {
      header: {
        address: branch.address,
        whatsappNumber: branch.whatsapp_number,
        instagramHandle: branch.instagram_handle,
      },
      occurredAt: new Date(sale.occurred_at),
      servedByFirstName: sale.first_name,
      operationNumber: sale.operation_number,
      total: amountToCharge({ lines, saleDiscount }),
      saleDiscount: receiptSaleDiscount(saleDiscount),
      lines,
      payments: readSalePayments(this.database, saleId).map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        tendered: payment.method === "CASH" ? (payment.tendered ?? null) : null,
      })),
      fiscal: readSaleFiscalDocument(this.database, saleId),
    };
  }

  private receiptLines(saleId: string): ReceiptSource["lines"] {
    const lines = this.database
      .prepare<[string], LineRow>(
        `SELECT sale_lines.id AS id, sale_lines.product_name AS product_name,
                sale_lines.sale_unit AS sale_unit, sale_lines.quantity AS quantity,
                sale_lines.list_unit_price AS list_unit_price,
                sale_lines.promotion_id AS promotion_id,
                sale_lines.manual_adjustment_kind AS manual_adjustment_kind,
                sale_lines.manual_adjustment_value AS manual_adjustment_value,
                sale_lines.manual_adjustment_reason AS manual_adjustment_reason,
                sale_lines.manual_adjustment_authorized_by AS manual_adjustment_authorized_by,
                sale_lines.discount_amount AS discount_amount, sale_lines.line_total AS line_total
         FROM sale_lines
         WHERE sale_lines.sale_id = ? ORDER BY sale_lines.position`,
      )
      .all(saleId);
    const frozen = this.database
      .prepare<[string], FrozenPromotionRow>(
        `SELECT sale_line_promotions.line_id, sale_line_promotions.discount_id,
                sale_line_promotions.name,
                sale_line_promotions.kind, sale_line_promotions.percent,
                sale_line_promotions.buy_qty, sale_line_promotions.pay_qty
         FROM sale_line_promotions
         JOIN sale_lines ON sale_lines.id = sale_line_promotions.line_id
         WHERE sale_lines.sale_id = ?
         ORDER BY sale_line_promotions.discount_id`,
      )
      .all(saleId);
    return lines.map((line) => ({
      productName: line.product_name,
      saleUnit: line.sale_unit as SaleUnit,
      quantity: line.quantity,
      listUnitPrice: line.list_unit_price,
      promotions: frozen
        .filter((promotion) => promotion.line_id === line.id)
        .map(
          (promotion): LinePromotion => ({
            id: promotion.discount_id,
            name: promotion.name,
            benefit: toBenefit(promotion),
          }),
        ),
      promotionId: line.promotion_id,
      manualAdjustment: adjustmentValue(toManualAdjustment(line)),
      discountAmount: line.discount_amount,
      lineTotal: line.line_total,
    }));
  }

  private storedReceipt(saleId: string): StoredReceipt | undefined {
    const row = this.database
      .prepare<[string], StoredReceiptRow>(
        "SELECT template_version, head, body FROM sale_receipts WHERE sale_id = ?",
      )
      .get(saleId);
    return row === undefined
      ? undefined
      : {
          templateVersion: row.template_version,
          head: new Uint8Array(row.head),
          body: new Uint8Array(row.body),
        };
  }

  private recordStoredReceipt(saleId: string, receipt: StoredReceipt): void {
    this.database
      .prepare(
        `INSERT INTO sale_receipts (sale_id, template_version, head, body)
         VALUES (@sale_id, @template_version, @head, @body)`,
      )
      .run({
        sale_id: saleId,
        template_version: receipt.templateVersion,
        head: Buffer.from(receipt.head),
        body: Buffer.from(receipt.body),
      });
  }

  private recordPrintAttempt(saleId: string, at: Date): void {
    this.database
      .prepare("UPDATE sales SET print_attempted_at = ? WHERE id = ?")
      .run(at.toISOString(), saleId);
  }

  private recordPrinted(saleId: string, at: Date): void {
    this.database
      .prepare("UPDATE sales SET printed_at = ? WHERE id = ?")
      .run(at.toISOString(), saleId);
  }

  private recordReprint(reprint: ReceiptReprint): void {
    this.database
      .prepare(
        `INSERT INTO sale_reprints (
           sale_id, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at
         ) VALUES (
           @sale_id, @order_number, @requested_by, @authorized_by, @reason_kind, @reason_text,
           @occurred_at
         )`,
      )
      .run({
        sale_id: reprint.saleId,
        order_number: reprint.orderNumber,
        requested_by: reprint.requestedBy,
        authorized_by: reprint.authorizedBy,
        reason_kind: reprint.reason.kind,
        reason_text: reprint.reason.kind === "requested" ? reprint.reason.text : null,
        occurred_at: reprint.occurredAt.toISOString(),
      });
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the outbox has no chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}
