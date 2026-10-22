import { type UnbilledDeferredSales, unbilledDeferredSalesSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudList } from "./fiscal-api-request";

export function fetchUnbilledDeferredSales(): Promise<CloudReadOutcome<UnbilledDeferredSales>> {
  return readCloudList(
    "/api/fiscal/unbilled-deferred-sales",
    (body) => unbilledDeferredSalesSchema.safeParse(body).data,
  );
}
