import type { DiscardRefundModalServices } from "./discard-refund-modal";
import type { MarkRefundDoneModalServices } from "./mark-refund-done-modal";
import { discardRefund, fetchPendingRefunds, markRefundDone } from "./refunds-api";

export type OutsideRefundsScreenServices = {
  fetchPendingRefunds: typeof fetchPendingRefunds;
} & MarkRefundDoneModalServices &
  DiscardRefundModalServices;

export const defaultOutsideRefundsScreenServices: OutsideRefundsScreenServices = {
  fetchPendingRefunds,
  markRefundDone,
  discardRefund,
};
