import type { MarkRefundDoneModalServices } from "./mark-refund-done-modal";
import { fetchPendingRefunds, markRefundDone } from "./refunds-api";

export type PendingRefundsScreenServices = {
  fetchPendingRefunds: typeof fetchPendingRefunds;
} & MarkRefundDoneModalServices;

export const defaultPendingRefundsScreenServices: PendingRefundsScreenServices = {
  fetchPendingRefunds,
  markRefundDone,
};
