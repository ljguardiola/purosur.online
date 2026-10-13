import { confirmPrice, fetchPriceMargin, fetchPrices, setPrice } from "./prices-api";

export type PricesListScreenServices = {
  fetchPrices: typeof fetchPrices;
  fetchPriceMargin: typeof fetchPriceMargin;
  setPrice: typeof setPrice;
  confirmPrice: typeof confirmPrice;
};

export const defaultPricesListScreenServices: PricesListScreenServices = {
  fetchPrices,
  fetchPriceMargin,
  setPrice,
  confirmPrice,
};
