import type { SaleStockMovement } from "@purosur/domain/sales/use-cases";
import type {
  PulledStockMovement,
  ReplicatedStockLedger,
  ReplicatedStockMovement,
} from "@purosur/domain/stock/use-cases";
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

export class SqliteReplicatedStockLedger implements ReplicatedStockLedger {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  movement(id: string): ReplicatedStockMovement | undefined {
    const row = this.database
      .prepare<[string], { superseded_by_count_id: string | null }>(
        "SELECT superseded_by_count_id FROM stock_movements WHERE id = ?",
      )
      .get(id);
    return row && { supersededByCountId: row.superseded_by_count_id };
  }

  recordMovement(movement: PulledStockMovement): void {
    this.database
      .prepare(
        `INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at, superseded_by_count_id)
         VALUES (@id, @product_id, @kind, @delta, @occurred_at, @superseded_by_count_id)`,
      )
      .run({
        id: movement.id,
        product_id: movement.productId,
        kind: movement.kind,
        delta: movement.delta,
        occurred_at: movement.occurredAt.toISOString(),
        superseded_by_count_id: movement.supersededByCountId,
      });
  }

  markSuperseded(id: string, countId: string): void {
    this.database
      .prepare("UPDATE stock_movements SET superseded_by_count_id = ? WHERE id = ?")
      .run(countId, id);
  }

  addToBalance(productId: string, delta: number): void {
    addToStockBalance(this.database, productId, delta);
  }
}
