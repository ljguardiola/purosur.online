import type { Clock } from "../../shared/index.js";
import { isRefundSentByCloud, mercadoPagoRefundStage } from "../model/mercado-pago-refund.js";
import { isRefundDiscardable } from "../model/payment-refund.js";
import type { PendingRefund, PendingRefundsReader } from "./refund-store.js";

export interface ListPendingRefundsPorts {
  reader: PendingRefundsReader;
  clock: Clock;
}

export interface ListPendingRefundsInput {
  locationId: string;
}

export async function listPendingRefunds(
  { reader, clock }: ListPendingRefundsPorts,
  { locationId }: ListPendingRefundsInput,
): Promise<PendingRefund[]> {
  const refunds = await reader.pendingRefunds(locationId);
  const now = clock.now().getTime();
  return refunds.map((refund) => {
    const sentByCloud = isRefundSentByCloud(refund);
    return {
      ...refund,
      discardable: isRefundDiscardable(refund.origin),
      sentByCloud,
      deliveryStage: sentByCloud ? mercadoPagoRefundStage(refund) : null,
      secondsPending: Math.max(0, Math.floor((now - refund.occurredAt.getTime()) / 1000)),
    };
  });
}
