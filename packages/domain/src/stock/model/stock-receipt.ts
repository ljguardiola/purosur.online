export interface ReceivedPurchaseLine {
  purchaseLineId: string;
  productId: string;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  lotNumber: string | null;
  expiresOn: string | null;
}

export interface PurchaseReceipt {
  locationId: string;
  occurredAt: Date;
  actorId: string;
  lines: readonly ReceivedPurchaseLine[];
}

export function movesBalance(movement: { supersededByCountId: string | null }): boolean {
  return movement.supersededByCountId === null;
}
