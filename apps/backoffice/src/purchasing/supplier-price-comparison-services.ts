import { fetchSupplierPriceComparison } from "./supplier-price-comparison-api";

export type SupplierPriceComparisonScreenServices = {
  fetchSupplierPriceComparison: typeof fetchSupplierPriceComparison;
};

export const defaultSupplierPriceComparisonScreenServices: SupplierPriceComparisonScreenServices = {
  fetchSupplierPriceComparison,
};
