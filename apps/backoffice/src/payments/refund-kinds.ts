import type { PendingRefundsBody } from "@purosur/contracts";

type Refund = PendingRefundsBody["refunds"][number];

export function sentToMercadoPago<R extends Pick<Refund, "sent_by_cloud">>(refunds: R[]): R[] {
  return refunds.filter((refund) => refund.sent_by_cloud);
}

export function madeOutsideTheSystem<R extends Pick<Refund, "sent_by_cloud">>(refunds: R[]): R[] {
  return refunds.filter((refund) => !refund.sent_by_cloud);
}
