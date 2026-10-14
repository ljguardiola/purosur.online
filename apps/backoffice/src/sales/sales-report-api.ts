import {
  type ReportQuery,
  type SalesByProductAndCategoryBody,
  type SalesByProductAndCategoryQuery,
  type SalesReportBody,
  salesByProductAndCategorySchema,
  salesReportSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudJson } from "../platform/read-cloud-json";

export function fetchSalesReport(query: ReportQuery): Promise<CloudReadOutcome<SalesReportBody>> {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const path = "/api/reports/sales-by-day";
  return readCloudJson(search ? `${path}?${search}` : path, salesReportSchema);
}

export function fetchSalesByProductAndCategory(
  query: SalesByProductAndCategoryQuery,
): Promise<CloudReadOutcome<SalesByProductAndCategoryBody>> {
  const params = new URLSearchParams({ group: query.group });
  for (const key of ["from", "to", "register_id"] as const) {
    const value = query[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  return readCloudJson(
    `/api/reports/sales-by-product-and-category?${params.toString()}`,
    salesByProductAndCategorySchema,
  );
}
