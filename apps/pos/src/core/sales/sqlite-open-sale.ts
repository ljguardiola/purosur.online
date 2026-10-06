import type { DiscountBenefit, LinePromotion, SaleLine, SaleWithLines } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

interface SaleRow {
  id: string;
  register_id: string;
  device_id: string;
  session_id: string;
  actor_id: string;
}

interface LineRow {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  list_unit_price: number;
  price_list_id: string;
  promotion_id: string | null;
  discount_amount: number;
  line_total: number;
}

export interface BenefitColumns {
  kind: DiscountBenefit["kind"];
  percent: number | null;
  buy_qty: number | null;
  pay_qty: number | null;
}

interface FrozenPromotionRow extends BenefitColumns {
  line_id: string;
  discount_id: string;
}

export function toBenefit(columns: BenefitColumns): DiscountBenefit {
  return columns.kind === "PERCENT_OFF"
    ? { kind: "PERCENT_OFF", percent: columns.percent as number }
    : { kind: "BUY_N_PAY_M", buyQty: columns.buy_qty as number, payQty: columns.pay_qty as number };
}

export function readOpenSale(
  database: LocalDatabase,
  sessionId: string,
): SaleWithLines | undefined {
  const sale = database
    .prepare<[string], SaleRow>(
      `SELECT id, register_id, device_id, session_id, actor_id
       FROM sales WHERE session_id = ? AND state = 'OPEN'`,
    )
    .get(sessionId);
  if (sale === undefined) {
    return undefined;
  }
  const lines = database
    .prepare<[string], LineRow>(
      `SELECT id, product_id, product_name, quantity, list_unit_price, price_list_id,
              promotion_id, discount_amount, line_total
       FROM sale_lines WHERE sale_id = ? ORDER BY position`,
    )
    .all(sale.id);
  const frozen = database
    .prepare<[string], FrozenPromotionRow>(
      `SELECT sale_line_promotions.line_id, sale_line_promotions.discount_id,
              sale_line_promotions.kind, sale_line_promotions.percent,
              sale_line_promotions.buy_qty, sale_line_promotions.pay_qty
       FROM sale_line_promotions
       JOIN sale_lines ON sale_lines.id = sale_line_promotions.line_id
       WHERE sale_lines.sale_id = ?
       ORDER BY sale_line_promotions.discount_id`,
    )
    .all(sale.id);
  return {
    id: sale.id,
    registerId: sale.register_id,
    deviceId: sale.device_id,
    sessionId: sale.session_id,
    actorId: sale.actor_id,
    state: "OPEN",
    lines: lines.map((line) =>
      toSaleLine(
        line,
        frozen.filter((promotion) => promotion.line_id === line.id).map(toLinePromotion),
      ),
    ),
  };
}

function toLinePromotion(row: FrozenPromotionRow): LinePromotion {
  return { id: row.discount_id, benefit: toBenefit(row) };
}

function toSaleLine(row: LineRow, promotions: LinePromotion[]): SaleLine {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    listUnitPrice: row.list_unit_price,
    priceListId: row.price_list_id,
    promotions,
    promotionId: row.promotion_id,
    discountAmount: row.discount_amount,
    lineTotal: row.line_total,
  };
}
