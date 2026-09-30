export type SaleState = "OPEN" | "COMPLETED" | "CANCELLED" | "VOIDED";

export interface Sale {
  id: string;
  registerId: string;
  deviceId: string;
  sessionId: string;
  actorId: string;
  state: SaleState;
  occurredAt: Date;
}

export interface SaleLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  listUnitPrice: number;
  priceListId: string;
  lineTotal: number;
}

export interface SaleWithLines extends Sale {
  lines: SaleLine[];
}
