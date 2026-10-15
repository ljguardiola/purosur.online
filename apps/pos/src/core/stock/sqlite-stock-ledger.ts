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

export function insertSaleVoidStockMovement(
  database: LocalDatabase,
  movement: SaleStockMovement,
): void {
  database
    .prepare(
      `INSERT INTO stock_movements (id, product_id, kind, sale_line_id, delta, occurred_at)
       VALUES (@id, @product_id, 'sale_void', @sale_line_id, @delta, @occurred_at)`,
    )
    .run({
      id: movement.id,
      product_id: movement.productId,
      sale_line_id: movement.saleLineId,
      delta: movement.delta,
      occurred_at: movement.occurredAt.toISOString(),
    });
}

export function readSaleStockMovements(
  database: LocalDatabase,
  saleId: string,
): SaleStockMovement[] {
  return database
    .prepare<
      [string],
      { id: string; sale_line_id: string; product_id: string; delta: number; occurred_at: string }
    >(
      `SELECT stock_movements.id AS id, stock_movements.sale_line_id AS sale_line_id,
              stock_movements.product_id AS product_id, stock_movements.delta AS delta,
              stock_movements.occurred_at AS occurred_at
       FROM stock_movements JOIN sale_lines ON sale_lines.id = stock_movements.sale_line_id
       WHERE sale_lines.sale_id = ? AND stock_movements.kind = 'sale'
       ORDER BY stock_movements.rowid`,
    )
    .all(saleId)
    .map((row) => ({
      id: row.id,
      saleLineId: row.sale_line_id,
      productId: row.product_id,
      delta: row.delta,
      occurredAt: new Date(row.occurred_at),
    }));
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
      .prepare<[string], { superseded_by_count_id: string | null; delta: number }>(
        "SELECT superseded_by_count_id, delta FROM stock_movements WHERE id = ?",
      )
      .get(id);
    return row && { supersededByCountId: row.superseded_by_count_id, delta: row.delta };
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

  adoptMovementDelta(id: string, delta: number): void {
    this.database.prepare("UPDATE stock_movements SET delta = ? WHERE id = ?").run(delta, id);
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
