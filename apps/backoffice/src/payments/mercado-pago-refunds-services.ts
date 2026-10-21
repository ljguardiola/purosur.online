import type { DiscardRefundModalServices } from "./discard-refund-modal";
import { confirmRefund, discardRefund, fetchPendingRefunds } from "./refunds-api";
import type { SendRefundModalServices } from "./send-refund-modal";

export type MercadoPagoRefundsScreenServices = {
  fetchPendingRefunds: typeof fetchPendingRefunds;
} & SendRefundModalServices &
  DiscardRefundModalServices;

export const defaultMercadoPagoRefundsScreenServices: MercadoPagoRefundsScreenServices = {
  fetchPendingRefunds,
  confirmRefund,
  discardRefund,
};
