import type { StockMovementKind } from "../model/stock-movement-kind.js";

export interface PulledStockMovement {
  id: string;
  productId: string;
  kind: StockMovementKind;
  delta: number;
  occurredAt: Date;
  supersededByCountId: string | null;
}

export interface ReplicatedStockMovement {
  supersededByCountId: string | null;
}

export interface ReplicatedStockLedger {
  movement(id: string): ReplicatedStockMovement | undefined;
  recordMovement(movement: PulledStockMovement): void;
  markSuperseded(id: string, countId: string): void;
  addToBalance(productId: string, delta: number): void;
}
