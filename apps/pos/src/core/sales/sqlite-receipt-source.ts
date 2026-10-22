import {
  amountToCharge,
  type LinePromotion,
  type ManualAdjustment,
  type ManualAdjustmentValue,
  type ReceiptSource,
  type SaleDiscount,
  type SaleDiscountValue,
  type SaleUnit,
} from "@purosur/domain";
import { readSaleFiscalDocument } from "../fiscal/sqlite-sale-fiscal-document";
import { readSalePayments } from "../payments/sqlite-sale-payments";
import type { LocalDatabase } from "../platform/local-database";
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

export function readReceiptSource(
  database: LocalDatabase,
  saleId: string,
  state: "COMPLETED" | "VOIDED",
): ReceiptSource {
  const sale = database
    .prepare<[string, string], SaleRow>(
      `SELECT sales.occurred_at AS occurred_at, users.first_name AS first_name,
              sales.operation_number AS operation_number,
              sales.sale_discount_kind AS sale_discount_kind,
              sales.sale_discount_value AS sale_discount_value,
              sales.sale_discount_reason AS sale_discount_reason,
              sales.sale_discount_authorized_by AS sale_discount_authorized_by
       FROM sales JOIN users ON users.id = sales.actor_id
       WHERE sales.id = ? AND sales.state = ?`,
    )
    .get(saleId, state);
  const branch = database
    .prepare<[], BranchRow>(
      "SELECT address, whatsapp_number, instagram_handle FROM branch_settings ORDER BY location_id LIMIT 1",
    )
    .get();
  if (sale === undefined || sale.operation_number === null || branch === undefined) {
    throw new Error("the sale's receipt cannot be sourced");
  }
  const lines = receiptLines(database, saleId);
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
    payments: readSalePayments(database, saleId).map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      tendered: payment.method === "CASH" ? (payment.tendered ?? null) : null,
    })),
    fiscal: readSaleFiscalDocument(database, saleId),
  };
}

function receiptLines(database: LocalDatabase, saleId: string): ReceiptSource["lines"] {
  const lines = database
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
  const frozen = database
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
