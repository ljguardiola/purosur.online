import { mapCloudData } from "../platform/map-cloud-data";
import type { CloudData } from "../platform/use-cloud-query";
import { usePendingRefundsQuery } from "./payments-queries";
import { madeOutsideTheSystem, sentToMercadoPago } from "./refund-kinds";
import type { fetchPendingRefunds } from "./refunds-api";

export type PendingRefundCounts = { mercadoPago: number; outsideTheSystem: number };

export function usePendingRefundCounts(params: {
  enabled: boolean;
  fetchPendingRefunds: typeof fetchPendingRefunds;
  onSessionEnded: () => void;
}): CloudData<PendingRefundCounts> {
  return mapCloudData(usePendingRefundsQuery(params), ({ refunds }) => ({
    mercadoPago: sentToMercadoPago(refunds).length,
    outsideTheSystem: madeOutsideTheSystem(refunds).length,
  }));
}
