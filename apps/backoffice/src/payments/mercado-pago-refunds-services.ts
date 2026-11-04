import type { DiscardRefundModalServices } from "./discard-refund-modal";
import {
  confirmRefund,
  discardRefund,
  fetchPendingRefunds,
  recordRefundTransfer,
} from "./refunds-api";
import type { SendRefundModalServices } from "./send-refund-modal";
import type { TransferRefundModalServices } from "./transfer-refund-modal";

export type MercadoPagoRefundsScreenServices = {
  fetchPendingRefunds: typeof fetchPendingRefunds;
} & SendRefundModalServices &
  DiscardRefundModalServices &
  TransferRefundModalServices;

export const defaultMercadoPagoRefundsScreenServices: MercadoPagoRefundsScreenServices = {
  fetchPendingRefunds,
  confirmRefund,
  discardRefund,
  recordRefundTransfer,
};
