import type { DiscardRefundModalServices } from "./discard-refund-modal";
import type { MarkRefundDoneModalServices } from "./mark-refund-done-modal";
import { discardRefund, fetchPendingRefunds, markRefundDone } from "./refunds-api";

export type PendingRefundsScreenServices = {
  fetchPendingRefunds: typeof fetchPendingRefunds;
} & MarkRefundDoneModalServices &
  DiscardRefundModalServices;

export const defaultPendingRefundsScreenServices: PendingRefundsScreenServices = {
  fetchPendingRefunds,
  markRefundDone,
  discardRefund,
};
