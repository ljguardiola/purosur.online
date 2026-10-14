import type { DiscardRefundModalServices } from "./discard-refund-modal";
import type { MarkRefundDoneModalServices } from "./mark-refund-done-modal";
import { confirmRefund, discardRefund, fetchPendingRefunds, markRefundDone } from "./refunds-api";
import type { SendRefundModalServices } from "./send-refund-modal";

export type PendingRefundsScreenServices = {
  fetchPendingRefunds: typeof fetchPendingRefunds;
} & MarkRefundDoneModalServices &
  DiscardRefundModalServices &
  SendRefundModalServices;

export const defaultPendingRefundsScreenServices: PendingRefundsScreenServices = {
  fetchPendingRefunds,
  markRefundDone,
  discardRefund,
  confirmRefund,
};
