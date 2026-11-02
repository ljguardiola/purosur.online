import { fetchOrderSuggestion } from "./order-suggestion-api";
import { buildPurchaseOrders } from "./purchase-orders-api";

export type OrderSuggestionScreenServices = {
  fetchOrderSuggestion: typeof fetchOrderSuggestion;
  buildPurchaseOrders: typeof buildPurchaseOrders;
};

export const defaultOrderSuggestionScreenServices: OrderSuggestionScreenServices = {
  fetchOrderSuggestion,
  buildPurchaseOrders,
};
