import { APPROVED_PAYMENT_STATE } from "./payment.js";
import {
  type PaymentTransactionState,
  PENDING_PAYMENT_TRANSACTION_STATE,
} from "./payment-transaction.js";

export const PAID_ORDER_DISCOVERY_WINDOW_HOURS = 72;

export const PAID_ORDER_PAYMENT_STATE = APPROVED_PAYMENT_STATE;

export const PAID_ORDER_REPLACED = false;

export const SALE_PAYMENT_STATE_HOLDING_PAID_ORDER = APPROVED_PAYMENT_STATE;

export function paidOrderDiscoveryStart(now: Date): Date {
  return new Date(now.getTime() - PAID_ORDER_DISCOVERY_WINDOW_HOURS * 60 * 60 * 1000);
}

export type LocalSaleOfPaidOrder = "open" | "closed";

export interface LocalStateOfPaidOrder {
  payment: PaymentTransactionState | undefined;
  sale: LocalSaleOfPaidOrder | undefined;
}

export type PaidOrderClassification =
  | "recorded"
  | "charge_under_way"
  | "apply_to_open_sale"
  | "duplicate_charge"
  | "without_sale";

export function classifyPaidOrder({
  payment,
  sale,
}: LocalStateOfPaidOrder): PaidOrderClassification {
  if (payment === PAID_ORDER_PAYMENT_STATE) {
    return "recorded";
  }
  if (payment === PENDING_PAYMENT_TRANSACTION_STATE) {
    return "charge_under_way";
  }
  if (sale === "open") {
    return "apply_to_open_sale";
  }
  return sale === undefined ? "without_sale" : "duplicate_charge";
}

export interface PaidOrderResolution {
  resolved: boolean;
}

export function paidOrderWithoutSaleBlocksSelling(
  paidOrders: readonly PaidOrderResolution[],
): boolean {
  return paidOrders.some((paidOrder) => !paidOrder.resolved);
}

export const PAID_ORDER_DISCOVERY_STATES = ["pending", "deferred", "checked"] as const;

export type PaidOrderDiscoveryState = (typeof PAID_ORDER_DISCOVERY_STATES)[number];

export interface StartingASale {
  openSale: boolean;
  discovery: PaidOrderDiscoveryState;
}

export type PaidOrdersSellingRefusal = "paid_order_without_sale" | "paid_orders_not_checked";

export function paidOrdersSellingRefusal(
  paidOrders: readonly PaidOrderResolution[],
  { openSale, discovery }: StartingASale,
): PaidOrdersSellingRefusal | undefined {
  if (openSale) {
    return undefined;
  }
  if (paidOrderWithoutSaleBlocksSelling(paidOrders)) {
    return "paid_order_without_sale";
  }
  return discovery === "pending" ? "paid_orders_not_checked" : undefined;
}

export function paidOrdersWithoutSaleLetSell(
  paidOrders: readonly PaidOrderResolution[],
  startingASale: StartingASale,
): boolean {
  return paidOrdersSellingRefusal(paidOrders, startingASale) === undefined;
}
