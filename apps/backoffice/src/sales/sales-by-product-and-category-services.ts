import { fetchSalesByProductAndCategory } from "./sales-report-api";

export type SalesByProductAndCategoryScreenServices = {
  fetchSalesByProductAndCategory: typeof fetchSalesByProductAndCategory;
};

export const defaultSalesByProductAndCategoryScreenServices: SalesByProductAndCategoryScreenServices =
  { fetchSalesByProductAndCategory };
