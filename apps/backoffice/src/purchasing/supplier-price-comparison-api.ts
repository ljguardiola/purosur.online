import { type SupplierPriceComparison, supplierPriceComparisonSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export type FetchSupplierPriceComparisonOutcome = CloudReadOutcome<SupplierPriceComparison>;

export function fetchSupplierPriceComparison(): Promise<FetchSupplierPriceComparisonOutcome> {
  return readCloudJson("/api/supplier-price-comparison", supplierPriceComparisonSchema);
}
