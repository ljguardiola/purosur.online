import {
  type ReportQuery,
  type SalesByPaymentMethodBody,
  salesByPaymentMethodSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchSalesByPaymentMethod(
  query: ReportQuery,
): Promise<CloudReadOutcome<SalesByPaymentMethodBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/sales-by-payment-method";
  return readCloudJson(search ? `${path}?${search}` : path, salesByPaymentMethodSchema);
}
