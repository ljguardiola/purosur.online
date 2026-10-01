import type { DiscountBenefit } from "../../pricing/index.js";

export type SaleState = "OPEN" | "COMPLETED" | "VOIDED";

export interface Sale {
  id: string;
  registerId: string;
  deviceId: string;
  sessionId: string;
  actorId: string;
  state: SaleState;
  occurredAt: Date;
}

export interface LinePromotion {
  id: string;
  benefit: DiscountBenefit;
}

export interface SaleLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  listUnitPrice: number;
  priceListId: string;
  promotions: LinePromotion[];
  promotionId: string | null;
  discountAmount: number;
  lineTotal: number;
}

export interface SaleWithLines extends Sale {
  lines: SaleLine[];
}
