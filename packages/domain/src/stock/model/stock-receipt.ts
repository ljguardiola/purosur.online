import type { StockMovementKind } from "./stock-movement-kind.js";

export interface ReceiptMovement {
  productId: string;
  locationId: string;
  kind: Extract<StockMovementKind, "receipt">;
  reason: null;
  delta: number;
  occurredAt: Date;
  actorId: string;
  purchaseLineId: string;
  supersededByCountId: string | null;
}

export interface ReceivedStock {
  productId: string;
  locationId: string;
  quantity: number;
  occurredAt: Date;
  actorId: string;
  purchaseLineId: string;
}

export function receiptMovement(
  received: ReceivedStock,
  coveringCountId: string | null,
): ReceiptMovement {
  return {
    productId: received.productId,
    locationId: received.locationId,
    kind: "receipt",
    reason: null,
    delta: received.quantity,
    occurredAt: received.occurredAt,
    actorId: received.actorId,
    purchaseLineId: received.purchaseLineId,
    supersededByCountId: coveringCountId,
  };
}

export function movesBalance(movement: { supersededByCountId: string | null }): boolean {
  return movement.supersededByCountId === null;
}
