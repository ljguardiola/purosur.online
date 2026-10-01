import type { SaleUnit } from "../../catalog/index.js";
import type { PriceReview } from "../model/price-review.js";
import type { CurrentPrice } from "./pricing-store.js";

export type PriceReviewFilter = "pending" | "all";

export interface PricesUnderReviewQuery {
  locationId: string;
  now: Date;
  review: PriceReviewFilter;
  categoryId?: string;
  search?: string;
}

export interface PriceUnderReview extends PriceReview {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
  currentPrice: CurrentPrice | null;
}

export interface PriceReviewCategory {
  id: string;
  name: string;
}

export interface PricesUnderReview {
  products: PriceUnderReview[];
  categories: PriceReviewCategory[];
  pendingCount: number;
  activeProductCount: number;
  reviewWindowDays: number;
}

export interface PriceReviewReader {
  pricesUnderReview(query: PricesUnderReviewQuery): Promise<PricesUnderReview>;
}
