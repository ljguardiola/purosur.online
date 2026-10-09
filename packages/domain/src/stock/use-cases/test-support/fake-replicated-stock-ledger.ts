import type {
  PulledStockMovement,
  ReplicatedStockLedger,
  ReplicatedStockMovement,
} from "../replicated-stock-ledger.js";

interface FakeReplicatedMovement extends ReplicatedStockMovement {
  productId: string;
  delta: number;
}

export class FakeReplicatedStockLedger implements ReplicatedStockLedger {
  private readonly movements = new Map<string, FakeReplicatedMovement>();
  private readonly balances = new Map<string, number>();

  seedBalance(productId: string, quantity: number): void {
    this.balances.set(productId, quantity);
  }

  recordOwnSale(movement: { id: string; productId: string; delta: number }): void {
    this.movements.set(movement.id, { ...movement, supersededByCountId: null });
    this.addToBalance(movement.productId, movement.delta);
  }

  balanceOf(productId: string): number {
    return this.balances.get(productId) ?? 0;
  }

  movement(id: string): ReplicatedStockMovement | undefined {
    const movement = this.movements.get(id);
    return movement && { supersededByCountId: movement.supersededByCountId };
  }

  recordMovement(movement: PulledStockMovement): void {
    this.movements.set(movement.id, {
      productId: movement.productId,
      delta: movement.delta,
      supersededByCountId: movement.supersededByCountId,
    });
  }

  markSuperseded(id: string, countId: string): void {
    const movement = this.movements.get(id);
    if (!movement) {
      throw new Error(`movement ${id} is not recorded`);
    }
    movement.supersededByCountId = countId;
  }

  addToBalance(productId: string, delta: number): void {
    this.balances.set(productId, this.balanceOf(productId) + delta);
  }
}
