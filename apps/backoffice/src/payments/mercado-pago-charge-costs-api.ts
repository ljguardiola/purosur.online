import {
  type MercadoPagoChargeCostsBody,
  type MercadoPagoChargeCostsQuery,
  mercadoPagoChargeCostsSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchMercadoPagoChargeCosts(
  query: MercadoPagoChargeCostsQuery,
): Promise<CloudReadOutcome<MercadoPagoChargeCostsBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/mercado-pago-charge-costs";
  return readCloudJson(search ? `${path}?${search}` : path, mercadoPagoChargeCostsSchema);
}
