import { fetchOrderSuggestion } from "./order-suggestion-api";

export type OrderSuggestionScreenServices = {
  fetchOrderSuggestion: typeof fetchOrderSuggestion;
};

export const defaultOrderSuggestionScreenServices: OrderSuggestionScreenServices = {
  fetchOrderSuggestion,
};
