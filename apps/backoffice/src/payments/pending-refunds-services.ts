import type { DiscardRefundModalServices } from "./discard-refund-modal";
import type { MarkRefundDoneModalServices } from "./mark-refund-done-modal";
import {
  confirmRefund,
  discardRefund,
  fetchPendingRefunds,
  markRefundDone,
  recordRefundTransfer,
} from "./refunds-api";
import type { SendRefundModalServices } from "./send-refund-modal";
import type { TransferRefundModalServices } from "./transfer-refund-modal";

export type PendingRefundsScreenServices = {
  fetchPendingRefunds: typeof fetchPendingRefunds;
} & SendRefundModalServices &
  DiscardRefundModalServices &
  TransferRefundModalServices &
  MarkRefundDoneModalServices;

export const defaultPendingRefundsScreenServices: PendingRefundsScreenServices = {
  fetchPendingRefunds,
  confirmRefund,
  discardRefund,
  recordRefundTransfer,
  markRefundDone,
};
