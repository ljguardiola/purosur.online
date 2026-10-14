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

type SaleStateOfPaidOrder = "OPEN" | "COMPLETED" | "VOIDED" | "CANCELLED";

export interface LocalStateOfPaidOrder {
  payment: PaymentTransactionState | undefined;
  sale: SaleStateOfPaidOrder | undefined;
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
  if (sale === "OPEN") {
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

export function paidOrdersWithoutSaleLetSell(
  paidOrders: readonly PaidOrderResolution[],
  { openSale }: { openSale: boolean },
): boolean {
  return openSale || !paidOrderWithoutSaleBlocksSelling(paidOrders);
}
