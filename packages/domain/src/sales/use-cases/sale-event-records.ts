import type { JsonValue } from "../../shared/index.js";
import type { LinePromotion, SaleLine } from "../model/sale.js";
import type { SaleCashMovement, SaleStockMovement } from "./sale-ledger.js";

function frozenPromotion({ id, benefit }: LinePromotion): JsonValue {
  return benefit.kind === "PERCENT_OFF"
    ? {
        discount_id: id,
        kind: benefit.kind,
        percent: benefit.percent,
        buy_qty: null,
        pay_qty: null,
      }
    : {
        discount_id: id,
        kind: benefit.kind,
        percent: null,
        buy_qty: benefit.buyQty,
        pay_qty: benefit.payQty,
      };
}

export function saleLineRecord(line: SaleLine): JsonValue {
  return {
    id: line.id,
    product_id: line.productId,
    product_name: line.productName,
    quantity: line.quantity,
    list_unit_price: line.listUnitPrice,
    price_list_id: line.priceListId,
    promotion_id: line.promotionId,
    discount_amount: line.discountAmount,
    promotions: line.promotions.map(frozenPromotion),
    line_total: line.lineTotal,
  };
}

export function saleCashMovementRecord(movement: SaleCashMovement): JsonValue {
  return {
    id: movement.id,
    type: movement.type,
    amount: movement.amount,
    ref_type: movement.ref.type,
    ref_id: movement.ref.id,
    actor_id: movement.actorId,
    occurred_at: movement.occurredAt.toISOString(),
  };
}

export function saleStockMovementRecord(movement: SaleStockMovement): JsonValue {
  return {
    id: movement.id,
    sale_line_id: movement.saleLineId,
    product_id: movement.productId,
    delta: movement.delta,
  };
}
