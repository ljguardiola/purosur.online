export interface PurchasedLine {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  lotNumber: string | null;
  expiresOn: string | null;
  purchasedOn: string;
}

export interface NewLot {
  productId: string;
  locationId: string;
  purchaseLineId: string;
  quantityReceived: number;
  costTotalCents: number;
  costQuantity: number;
  lotNumber: string | null;
  expiresOn: string | null;
  purchasedOn: string;
}

export function lotOfPurchaseLine(line: PurchasedLine): NewLot {
  return {
    productId: line.productId,
    locationId: line.locationId,
    purchaseLineId: line.id,
    quantityReceived: line.quantity,
    costTotalCents: line.costPaidCents,
    costQuantity: line.quantityPerPackage,
    lotNumber: line.lotNumber,
    expiresOn: line.expiresOn,
    purchasedOn: line.purchasedOn,
  };
}

export interface NewInitialCountLot {
  productId: string;
  locationId: string;
  originMovementId: string;
  quantityReceived: number;
  expiresOn: string | null;
}

export function lotOfOpeningCount(line: {
  movementId: string;
  productId: string;
  locationId: string;
  counted: number;
  expiresOn: string | null;
}): NewInitialCountLot {
  return {
    productId: line.productId,
    locationId: line.locationId,
    originMovementId: line.movementId,
    quantityReceived: line.counted,
    expiresOn: line.expiresOn,
  };
}
