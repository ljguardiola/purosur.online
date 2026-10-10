import type { SaleUnit } from "../../catalog/index.js";
import type { DiscountBenefit } from "../../pricing/index.js";
import type { WeightSource } from "./weight-source.js";

export type SaleState = "OPEN" | "COMPLETED" | "VOIDED" | "CANCELLED";

export interface Sale {
  id: string;
  registerId: string;
  deviceId: string;
  sessionId: string;
  actorId: string;
  state: SaleState;
}

export interface LinePromotion {
  id: string;
  benefit: DiscountBenefit;
}

export interface SaleLine {
  id: string;
  productId: string;
  productName: string;
  saleUnit: SaleUnit;
  weightSource: WeightSource | null;
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
