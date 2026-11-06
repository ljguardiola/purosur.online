import { mapCloudData } from "../platform/map-cloud-data";
import type { CloudData } from "../platform/use-cloud-query";
import type { fetchPrices } from "./prices-api";
import { usePricesQuery } from "./pricing-queries";

export function usePendingPricesCount(params: {
  enabled: boolean;
  fetchPrices: typeof fetchPrices;
  onSessionEnded: () => void;
}): CloudData<number> {
  return mapCloudData(
    usePricesQuery({
      input: { review: "pending" },
      fetchPrices: params.fetchPrices,
      onSessionEnded: params.onSessionEnded,
      enabled: params.enabled,
    }),
    (prices) => prices.pendingCount,
  );
}
