import { APPROVED_PAYMENT_STATE } from "./payment.js";
import type { PaymentTransactionState } from "./payment-transaction.js";

export const PAID_ORDER_DISCOVERY_WINDOW_HOURS = 72;

export const PAID_ORDER_PAYMENT_STATE = APPROVED_PAYMENT_STATE;

export const PAID_ORDER_REPLACED = false;

export function paidOrderDiscoveryStart(now: Date): Date {
  return new Date(now.getTime() - PAID_ORDER_DISCOVERY_WINDOW_HOURS * 60 * 60 * 1000);
}

export interface LocalStateOfPaidOrder {
  payment: PaymentTransactionState | undefined;
  sale: string | undefined;
}

export type PaidOrderClassification =
  | "recorded"
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
  if (sale === "OPEN") {
    return "apply_to_open_sale";
  }
  return sale === undefined ? "without_sale" : "duplicate_charge";
}

export function paidOrderWithoutSaleBlocksSelling(
  paidOrders: readonly { resolved: boolean }[],
): boolean {
  return paidOrders.some((paidOrder) => !paidOrder.resolved);
}
