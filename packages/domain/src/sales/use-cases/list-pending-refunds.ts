import type { PendingRefund, PendingRefundsReader } from "./refund-store.js";

export interface ListPendingRefundsPorts {
  reader: PendingRefundsReader;
}

export interface ListPendingRefundsInput {
  locationId: string;
}

export function listPendingRefunds(
  { reader }: ListPendingRefundsPorts,
  { locationId }: ListPendingRefundsInput,
): Promise<PendingRefund[]> {
  return reader.pendingRefunds(locationId);
}
