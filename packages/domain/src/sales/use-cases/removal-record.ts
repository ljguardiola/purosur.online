import type { JsonValue } from "../../sync/index.js";
import type { SaleLineRemoval } from "../model/sale-line-removal.js";

export function removalRecord(removal: SaleLineRemoval): JsonValue {
  return {
    id: removal.id,
    sale_line_id: removal.saleLineId,
    product_id: removal.productId,
    qty_removed: removal.qtyRemoved,
    amount_removed: removal.amountRemoved,
    actor_id: removal.actorId,
    occurred_at: removal.occurredAt.toISOString(),
  };
}
