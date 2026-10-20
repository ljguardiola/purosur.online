import { fetchSalesByPromotion } from "./sales-report-api";

export type SalesByPromotionScreenServices = {
  fetchSalesByPromotion: typeof fetchSalesByPromotion;
};

export const defaultSalesByPromotionScreenServices: SalesByPromotionScreenServices = {
  fetchSalesByPromotion,
};
