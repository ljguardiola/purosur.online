export interface PurchasedLine {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  costPaidCents: number;
  quantityPerPackage: number;
  lotNumber: string | null;
  expiresOn: string | null;
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
  };
}
