import { isRefundDiscardable } from "../model/payment-refund.js";
import type { PendingRefund, PendingRefundsReader } from "./refund-store.js";

export interface ListPendingRefundsPorts {
  reader: PendingRefundsReader;
}

export interface ListPendingRefundsInput {
  locationId: string;
}

export async function listPendingRefunds(
  { reader }: ListPendingRefundsPorts,
  { locationId }: ListPendingRefundsInput,
): Promise<PendingRefund[]> {
  const refunds = await reader.pendingRefunds(locationId);
  return refunds.map((refund) => ({ ...refund, discardable: isRefundDiscardable(refund.origin) }));
}
