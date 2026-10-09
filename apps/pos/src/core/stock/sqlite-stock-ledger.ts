import type { SaleStockMovement } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export function insertSaleStockMovement(
  database: LocalDatabase,
  movement: SaleStockMovement,
): void {
  database
    .prepare(
      `INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
       VALUES (@id, @product_id, 'sale', @sale_line_id, @delta, @occurred_at)`,
    )
    .run({
      id: movement.id,
      product_id: movement.productId,
      sale_line_id: movement.saleLineId,
      delta: movement.delta,
      occurred_at: movement.occurredAt.toISOString(),
    });
}

export function addToStockBalance(database: LocalDatabase, productId: string, delta: number): void {
  database
    .prepare(
      `INSERT INTO stock_balances (product_id, quantity) VALUES (@product_id, @delta)
       ON CONFLICT (product_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
    )
    .run({ product_id: productId, delta });
}
