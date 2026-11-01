import { fetchOrderSuggestion } from "./order-suggestion-api";
import { fetchSuppliers } from "./suppliers-api";

export type OrderSuggestionScreenServices = {
  fetchOrderSuggestion: typeof fetchOrderSuggestion;
  fetchSuppliers: typeof fetchSuppliers;
};

export const defaultOrderSuggestionScreenServices: OrderSuggestionScreenServices = {
  fetchOrderSuggestion,
  fetchSuppliers,
};
