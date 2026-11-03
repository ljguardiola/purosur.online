export interface ReceivedPurchaseLine {
  purchaseLineId: string;
  productId: string;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  expiresOn: string | null;
}

export interface PurchaseReceipt {
  locationId: string;
  occurredAt: Date;
  purchasedOn: string;
  actorId: string;
  lines: readonly ReceivedPurchaseLine[];
}

export function movesBalance(movement: { supersededByCountId: string | null }): boolean {
  return movement.supersededByCountId === null;
}
